import { supabase } from './supabase'
import type { Project } from '../types'

/**
 * Project sync engine.
 *
 * Responsibilities:
 *  - Debounce + coalesce writes per project (one request in flight per project,
 *    the latest state always wins locally, older states are never written after
 *    newer ones).
 *  - Optimistic concurrency on `projects.updated_at`: a write only lands if the
 *    row is still at the version we last saw. On conflict we fetch the remote
 *    row, three-way merge it with our local edits and retry, so two devices (or a
 *    contractor and a sub) no longer silently overwrite each other's work.
 *  - Echo suppression: realtime/loaded snapshots are recorded as the "base", so
 *    receiving a remote update never triggers a write-back.
 */

type Status = 'idle' | 'saving' | 'saved' | 'error'
type Listener = (projectId: string, status: Status) => void

interface Entry {
  base: Project | null          // last state known to match the server
  version: string | null        // server updated_at for `base`
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<boolean> | null
  dirty: boolean
}

const DEBOUNCE_MS = 800
const MAX_CONFLICT_RETRIES = 3

const entries = new Map<string, Entry>()
const listeners = new Set<Listener>()
let getLatest: (id: string) => Project | undefined = () => undefined
let applyMerged: (p: Project) => void = () => {}
let ctx: { ownerId: string; orgId?: string } | null = null

function entry(id: string): Entry {
  let e = entries.get(id)
  if (!e) {
    e = { base: null, version: null, timer: null, inFlight: null, dirty: false }
    entries.set(id, e)
  }
  return e
}

function emit(id: string, s: Status) { listeners.forEach(l => l(id, s)) }

export function onSyncStatus(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function configureProjectSync(opts: {
  getLatest: (id: string) => Project | undefined
  applyMerged: (p: Project) => void
}) {
  getLatest = opts.getLatest
  applyMerged = opts.applyMerged
}

export function setSyncContext(c: { ownerId: string; orgId?: string } | null) { ctx = c }

export function resetProjectSync() {
  entries.forEach(e => { if (e.timer) clearTimeout(e.timer) })
  entries.clear()
}

/** Record a server snapshot (initial load / realtime) as the merge base. */
export function recordRemote(project: Project, version: string | null) {
  const e = entry(project.id)
  e.base = project
  if (version) e.version = version
}

/** True if this exact object is the one we last synced/received. */
export function isBase(project: Project): boolean {
  return entries.get(project.id)?.base === project
}

export function hasLocalChanges(projectId: string): boolean {
  const e = entries.get(projectId)
  if (!e) return false
  if (e.dirty || e.inFlight || e.timer) return true
  const latest = getLatest(projectId)
  return !!latest && !!e.base && latest !== e.base
}

export function hasPendingSaves(): boolean {
  for (const [id, e] of entries) {
    if (e.dirty || e.inFlight || e.timer) return true
    const latest = getLatest(id)
    if (latest && e.base && latest !== e.base && !latest.isDemo) return true
  }
  return false
}

export function getBase(projectId: string): Project | null {
  return entries.get(projectId)?.base ?? null
}

/** Schedule a debounced save of the latest local state of a project. */
export function scheduleSave(projectId: string, immediate = false) {
  const e = entry(projectId)
  e.dirty = true
  if (e.timer) clearTimeout(e.timer)
  e.timer = setTimeout(() => { e.timer = null; void flush(projectId) }, immediate ? 0 : DEBOUNCE_MS)
}

/** Save now (awaitable). Resolves true once the latest state is on the server. */
export async function saveNow(projectId: string): Promise<boolean> {
  const e = entry(projectId)
  if (e.timer) { clearTimeout(e.timer); e.timer = null }
  e.dirty = true
  return flush(projectId)
}

async function flush(projectId: string): Promise<boolean> {
  const e = entry(projectId)
  if (e.inFlight) {
    // A newer state will be written right after the in-flight request.
    await e.inFlight.catch(() => false)
    if (!e.dirty) return true
    if (e.inFlight) return e.inFlight
  }
  e.dirty = false
  const p = writeLatest(projectId).finally(() => { e.inFlight = null })
  e.inFlight = p
  const ok = await p
  if (e.dirty) return flush(projectId)
  return ok
}

async function writeLatest(projectId: string): Promise<boolean> {
  const e = entry(projectId)
  if (!ctx) return false
  emit(projectId, 'saving')
  try {
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      const local = getLatest(projectId)
      if (!local || local.isDemo) { emit(projectId, 'idle'); return true }
      const res = await conditionalWrite(local, e.version)
      if (res.kind === 'ok') {
        e.base = local
        e.version = res.version
        emit(projectId, 'saved')
        return true
      }
      if (res.kind === 'error') { e.dirty = true; emit(projectId, 'error'); return false }
      // Conflict: someone else saved since our base. Merge and retry.
      const remote = await fetchRemote(projectId)
      if (!remote) { e.dirty = true; emit(projectId, 'error'); return false }
      const merged = mergeProjects(e.base, local, remote.data)
      e.base = remote.data
      e.version = remote.version
      if (merged !== local) applyMerged(merged)
    }
    e.dirty = true
    emit(projectId, 'error')
    return false
  } catch (err) {
    console.error('Project sync failed:', err)
    e.dirty = true
    emit(projectId, 'error')
    return false
  }
}

type WriteResult = { kind: 'ok'; version: string } | { kind: 'conflict' } | { kind: 'error' }

async function conditionalWrite(project: Project, version: string | null): Promise<WriteResult> {
  const now = new Date().toISOString()
  // UPDATE first — preserves owner_id/org_id (subs must never take ownership).
  let q = supabase
    .from('projects')
    .update({ name: project.name, address: project.address, updated_at: now, data: project })
    .eq('id', project.id)
  if (version) q = q.eq('updated_at', version)
  const { data: updated, error } = await q.select('id, updated_at')
  if (error) { console.error('Failed to sync project (update):', error.message); return { kind: 'error' } }
  if (updated && updated.length > 0) return { kind: 'ok', version: (updated[0] as { updated_at: string }).updated_at }

  // 0 rows: either version mismatch (conflict), no write access, or a new project.
  const { data: exists, error: exErr } = await supabase
    .from('projects').select('id').eq('id', project.id).maybeSingle()
  if (exErr) { console.error('Failed to check project:', exErr.message); return { kind: 'error' } }
  if (exists) return version ? { kind: 'conflict' } : { kind: 'error' }
  if (!ctx) return { kind: 'error' }

  const { data: ins, error: insErr } = await supabase
    .from('projects')
    .insert({
      id: project.id,
      owner_id: ctx.ownerId,
      org_id: ctx.orgId ?? null,
      name: project.name,
      address: project.address,
      created_at: project.createdAt,
      updated_at: now,
      data: project,
    })
    .select('updated_at')
    .single()
  if (insErr) { console.error('Failed to sync project (insert):', insErr.message); return { kind: 'error' } }
  return { kind: 'ok', version: (ins as { updated_at: string }).updated_at }
}

async function fetchRemote(id: string): Promise<{ data: Project; version: string } | null> {
  const { data, error } = await supabase.from('projects').select('data, updated_at').eq('id', id).maybeSingle()
  if (error || !data) return null
  return { data: data.data as Project, version: data.updated_at as string }
}

// ─── Three-way merge ─────────────────────────────────────────────────────────
// Zustand updates are immutable, so "did I change this?" is a reference check
// against the base snapshot. Arrays of objects with `id` are merged per element.

function isIdArray(v: unknown): v is { id: string }[] {
  return Array.isArray(v) && v.length > 0 && v.every(x => x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string')
}

function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (local === base) return remote
  if (remote === undefined || JSON.stringify(remote) === JSON.stringify(base)) return local
  if ((isIdArray(local) || isIdArray(remote) || isIdArray(base)) && Array.isArray(local) && Array.isArray(remote)) {
    return mergeIdArrays((Array.isArray(base) ? base : []) as { id: string }[], local as { id: string }[], remote as { id: string }[])
  }
  if (isPlainObject(local) && isPlainObject(remote)) {
    return mergeObjects(isPlainObject(base) ? base : {}, local, remote)
  }
  return local // both changed a scalar: local (the user in front of the screen) wins
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function mergeObjects(base: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const k of keys) {
    const v = mergeValue(base[k], local[k], remote[k])
    if (v !== undefined) out[k] = v
  }
  return out
}

function mergeIdArrays(base: { id: string }[], local: { id: string }[], remote: { id: string }[]) {
  const b = new Map(base.map(x => [x.id, x]))
  const l = new Map(local.map(x => [x.id, x]))
  const r = new Map(remote.map(x => [x.id, x]))
  const out: { id: string }[] = []
  const seen = new Set<string>()
  // Local order first (what the user sees), then remote-only additions.
  for (const item of [...local, ...remote]) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const bi = b.get(item.id), li = l.get(item.id), ri = r.get(item.id)
    if (li && ri) { out.push(mergeValue(bi, li, ri) as { id: string }); continue }
    if (li && !ri) { if (!bi || li !== bi) out.push(li); continue }        // remote deleted unchanged item → drop
    if (ri && !li) { if (!bi || JSON.stringify(ri) !== JSON.stringify(bi)) out.push(ri) } // local deleted unchanged → drop
  }
  return out
}

export function mergeProjects(base: Project | null, local: Project, remote: Project): Project {
  if (!base) return local
  return mergeObjects(
    base as unknown as Record<string, unknown>,
    local as unknown as Record<string, unknown>,
    remote as unknown as Record<string, unknown>,
  ) as unknown as Project
}
