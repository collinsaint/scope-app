import type { Project } from '../types'
import { mergeItems } from './parseExcel'

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

// Scope items are DERIVED from the uploaded documents and get fresh ids on every
// parse. Merging them by id across a document change would union two copies of
// the whole scope (old ids + new ids) — i.e. duplicate line items. So when
// either side changed the documents, take that side's derived items wholesale
// and only carry over the other side's per-item user state (by line identity).
const DERIVED_KEYS = ['items', 'walkSourceItems', 'scopeTotal'] as const

function sameJSON(a: unknown, b: unknown) { return a === b || JSON.stringify(a) === JSON.stringify(b) }

export function mergeProjects(base: Project | null, local: Project, remote: Project): Project {
  if (!base) return local
  const localDocsChanged = local.documents !== base.documents && !sameJSON(local.documents, base.documents)
  const remoteDocsChanged = !sameJSON(remote.documents, base.documents)
  if (localDocsChanged || remoteDocsChanged) {
    const winner = localDocsChanged ? local : remote
    const loser = localDocsChanged ? remote : local
    const merged = mergeObjects(
      base as unknown as Record<string, unknown>,
      local as unknown as Record<string, unknown>,
      remote as unknown as Record<string, unknown>,
    ) as unknown as Project
    merged.documents = winner.documents
    for (const k of DERIVED_KEYS) (merged as unknown as Record<string, unknown>)[k] = (winner as unknown as Record<string, unknown>)[k]
    // Keep the other side's completion/photo/comment state on lines that still exist.
    merged.items = mergeItems(loser.items ?? [], winner.items ?? []).map((it, i) => {
      const w = (winner.items ?? [])[i]
      // mergeItems restores loser state; let winner's own non-default state win.
      return w && (w.completed || w.pendingApproval || (w.photos?.length ?? 0) > 0) ? w : it
    })
    return merged
  }
  return mergeObjects(
    base as unknown as Record<string, unknown>,
    local as unknown as Record<string, unknown>,
    remote as unknown as Record<string, unknown>,
  ) as unknown as Project
}
