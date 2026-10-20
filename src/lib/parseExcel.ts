import * as XLSX from 'xlsx'
import type { ScopeItem } from '../types'

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

function isHeaderRow(desc: unknown): boolean {
  if (!desc) return false
  return String(desc).trimStart().startsWith('-')
}

function cleanHeaderText(desc: string): string {
  return desc.replace(/^[-\s]+/, '').replace(/[-\s]+$/, '').trim() || desc.trim()
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val
  if (!val) return 0
  return parseFloat(String(val).replace(/[$,\s]/g, '')) || 0
}

// XLSX serial dates (days since 1899-12-30), numeric strings, or ISO-ish strings → YYYY-MM-DD.
function parseExcelDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return ''
  const fromSerial = (n: number) => new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
  if (typeof val === 'number') return fromSerial(val)
  const s = String(val).trim()
  if (!s) return ''
  if (/^\d+(\.\d+)?$/.test(s)) return fromSerial(parseFloat(s)) // text-typed serial
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)        // M/D/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return s.slice(0, 10)
}

function isTrue(val: unknown): boolean {
  return val === true || /^(true|yes|y|1)$/i.test(String(val ?? '').trim())
}

const r2 = (n: number) => Math.round(n * 100) / 100

// ─── Line identity ───────────────────────────────────────────────────────────
// Matching ignores Activity, coverage, line number and notes (they differ
// between export formats / are rewritten by COs). Identity is
//   room + description + qty(2dp) + unit + |RCV|(2dp) + date
// with fallbacks that progressively drop RCV, then date. All matching is
// one-to-one so legitimate duplicate lines pair up correctly.
type KeyLevel = 0 | 1 | 2
function lineKey(i: ScopeItem, level: KeyLevel = 0): string {
  const base = `${i.room.trim().toLowerCase()}||${i.description.trim().toLowerCase()}||${r2(i.qty)}||${(i.unit ?? '').trim().toUpperCase()}`
  if (level === 2) return base
  if (level === 1) return `${base}||${i.date}`
  return `${base}||${i.date}||${r2(Math.abs(i.rcv))}`
}

/**
 * One-to-one matcher. `take(item)` returns the best unused candidate for item,
 * trying the exact key first, then the fallbacks. Candidates are consumed.
 */
function makeMatcher(candidates: ScopeItem[], maxLevel: KeyLevel = 2) {
  const used = new Set<string>()
  const maps: Map<string, ScopeItem[]>[] = []
  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const m = new Map<string, ScopeItem[]>()
    for (const c of candidates) {
      const k = lineKey(c, lvl as KeyLevel)
      const b = m.get(k)
      if (b) b.push(c); else m.set(k, [c])
    }
    maps.push(m)
  }
  return {
    take(item: ScopeItem, upTo: KeyLevel = maxLevel): ScopeItem | undefined {
      for (let lvl = 0; lvl <= Math.min(upTo, maxLevel); lvl++) {
        const bucket = maps[lvl].get(lineKey(item, lvl as KeyLevel))
        const hit = bucket?.find(c => !used.has(c.id))
        if (hit) { used.add(hit.id); return hit }
      }
      return undefined
    },
    isUsed: (id: string) => used.has(id),
    markUsed: (id: string) => { used.add(id) },
  }
}

// Remove paired line items where one credits out the other (same identity,
// opposite RCV). Requires the exact amount; falls back to ignoring the date.
export function cancelCreditedItems(items: ScopeItem[]): ScopeItem[] {
  const nonHeaders = items.filter(i => !i.isHeader)
  const positives = nonHeaders.filter(i => i.rcv > 0)
  const remove = new Set<string>()
  const match = makeMatcher(positives, 0)
  for (const neg of nonHeaders) {
    if (neg.rcv >= 0) continue
    let hit = match.take(neg, 0)
    if (!hit) {
      // date-less fallback, same amount
      hit = positives.find(p => !remove.has(p.id) && !match.isUsed(p.id) &&
        lineKey(p, 2) === lineKey(neg, 2) && r2(p.rcv) === r2(-neg.rcv))
      if (hit) match.markUsed(hit.id)
    }
    if (hit) { remove.add(neg.id); remove.add(hit.id) }
  }
  return items.filter(item => !remove.has(item.id))
}

function removeOrphanedHeaders(items: ScopeItem[]): ScopeItem[] {
  const result: ScopeItem[] = []

  for (let i = 0; i < items.length; i++) {
    if (!items[i].isHeader) {
      result.push(items[i])
      continue
    }

    const header = items[i]
    let hasItems = false

    for (let j = i + 1; j < items.length; j++) {
      if (items[j].room !== header.room) continue
      if (items[j].isHeader) break
      hasItems = true
      break
    }

    if (hasItems) result.push(header)
  }

  return result
}

interface ColMap {
  room: number
  description: number
  qty: number
  unit: number
  coverage: number
  activity: number | null  // null = not present in this file format
  rcv: number
  date: number
  note: number
  excluded: number
}

// Find column indices by searching the header row for known Xactimate column names.
// Returns null if this row doesn't look like a header row.
function tryBuildColMap(row: unknown[]): ColMap | null {
  const h = row.map(c => String(c ?? '').trim().toLowerCase())

  const find = (...names: string[]): number => {
    for (const name of names) {
      const idx = h.indexOf(name)
      if (idx >= 0) return idx
    }
    return -1
  }

  const description = find('description', 'desc', 'line item description', 'line description')
  const rcv = find('rcv', 'replacement cost value', 'replacement cost')

  // A row must have at least these two for us to treat it as the header row
  if (description < 0 || rcv < 0) return null

  const activity = find('activity', 'activity type')

  return {
    room:        find('group description', 'grp description', 'room/area', 'area description'),
    description,
    qty:         find('qty', 'quantity'),
    unit:        find('unit'),
    coverage:    find('sel.', 'coverage', 'selection'),
    activity:    activity >= 0 ? activity : null,
    rcv,
    date:        find('date'),
    note:        find('note 1', 'notes'),
    excluded:    find('excluded'),
  }
}

export interface ParseResult {
  items: ScopeItem[]
  hasActivity: boolean
}

export function parseExcelFile(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  // Scan the first 20 rows to find the column-header row
  let headerRowIdx = -1
  let cols: ColMap | null = null

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const candidate = tryBuildColMap(rows[i] as unknown[])
    if (candidate) {
      cols = candidate
      headerRowIdx = i
      break
    }
  }

  // Fall back to the known Xactimate Desktop column positions if header detection fails
  if (!cols || headerRowIdx < 0) {
    cols = { room: 2, description: 3, qty: 6, unit: 10, coverage: 11, activity: 12, rcv: 21, date: 33, note: 35, excluded: -1 }
    headerRowIdx = 0
  }

  // If room column wasn't found, fall back to column 2 (Group Description in standard format)
  if (cols.room < 0) cols.room = 2

  const items: ScopeItem[] = []

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const desc = row[cols.description]

    if (!desc) continue

    const room = String(row[cols.room] ?? 'Unknown').trim()
    if (!room || room === 'undefined') continue

    if (isHeaderRow(desc)) {
      items.push({
        id: randomId(),
        rowNum: typeof row[0] === 'number' ? row[0] : i,
        room,
        description: cleanHeaderText(String(desc)),
        qty: 0,
        unit: '',
        coverage: '',
        activity: '',
        rcv: 0,
        date: '',
        note: '',
        completed: false,
        photos: [],
        isHeader: true,
      })
      continue
    }

    items.push({
      id: randomId(),
      rowNum: typeof row[0] === 'number' ? row[0] : i,
      room,
      description: String(desc).trim(),
      qty:      cols.qty >= 0      ? r2(toNumber(row[cols.qty]))              : 0,
      unit:     cols.unit >= 0     ? String(row[cols.unit]     ?? '').trim()  : '',
      coverage: cols.coverage >= 0 ? String(row[cols.coverage] ?? '').trim()  : '',
      activity: cols.activity !== null ? String(row[cols.activity] ?? '').trim() : '',
      rcv:      r2(toNumber(row[cols.rcv])),
      ...(cols.excluded >= 0 && isTrue(row[cols.excluded]) ? { excluded: true } : {}),
      date:     cols.date >= 0     ? parseExcelDate(row[cols.date])           : '',
      note:     cols.note >= 0     ? String(row[cols.note]     ?? '').trim()  : '',
      completed: false,
      photos: [],
    })
  }

  return {
    items: removeOrphanedHeaders(items),
    hasActivity: cols.activity !== null,
  }
}

const USER_STATE_FIELDS = [
  'completed', 'completedAt', 'pendingApproval', 'pendingApprovalAt', 'returned', 'returnedAt',
  'returnComment', 'returnCommentBy', 'approvalComment', 'approvalCommentBy', 'photos',
  'subcontractorId', 'purchaseOrderId', 'comment', 'commentNotes',
] as const

/**
 * Carry user state (completion, photos, subs, POs, comments) from `existing`
 * onto the freshly derived `incoming` list. Matches by id first (ids are stable
 * across recomputes of the same documents), then by line identity one-to-one.
 */
export function mergeItems(existing: ScopeItem[], incoming: ScopeItem[]): ScopeItem[] {
  const prevLines = existing.filter(i => !i.isHeader)
  const byId = new Map(prevLines.map(i => [i.id, i]))
  const matcher = makeMatcher(prevLines, 1) // never carry state across a qty-only match
  // Reserve id matches first so key matching can't steal them.
  incoming.forEach(i => { if (!i.isHeader && byId.has(i.id)) matcher.markUsed(i.id) })
  return incoming.map(item => {
    if (item.isHeader) return item
    const prev = byId.get(item.id) ?? matcher.take(item)
    if (!prev) return item
    const out: ScopeItem = { ...item }
    for (const f of USER_STATE_FIELDS) (out as unknown as Record<string, unknown>)[f] = (prev as unknown as Record<string, unknown>)[f]
    return out
  })
}

/**
 * Diff the previous clean scope against the latest change order.
 *
 * Works for Full-SOW COs (every prior line repeated) and delta COs.
 *  - CO positive matched to a previous line → that previous line, unchanged
 *    (same id, so completion carries over), with the CO's RCV.
 *  - CO credit cancelling a CO positive (full-SOW style) → both REMOVED; if the
 *    positive corresponds to a previous line, that line is the one removed.
 *  - CO credit matching a previous line directly (delta style) → both REMOVED.
 *  - CO credit matching nothing → kept but flagged `unmatchedCredit` (hidden,
 *    surfaced as a warning).
 *  - Remaining CO positives → NEW (fresh state; includes Install-Only swaps).
 */
export function diffAndMergeChangeOrder(prevItems: ScopeItem[], coItems: ScopeItem[]): ScopeItem[] {
  const prevLines = prevItems.filter(i => !i.isHeader)
  const coLines = coItems.filter(i => !i.isHeader)
  const coPos = coLines.filter(i => i.rcv >= 0)
  const coNeg = coLines.filter(i => i.rcv < 0)

  // 1. Pair CO credits with CO positives (same identity, same |amount|).
  const coPosMatcher = makeMatcher(coPos, 1)
  const creditPairs: Array<{ credit: ScopeItem; pos: ScopeItem }> = []
  const loneCredits: ScopeItem[] = []
  const pairedPosIds = new Set<string>()
  for (const credit of coNeg) {
    const pos = coPosMatcher.take(credit, 1)
    if (pos) { creditPairs.push({ credit, pos }); pairedPosIds.add(pos.id) }
    else loneCredits.push(credit)
  }

  // 2. Map CO positives to previous lines, one-to-one. Exact pass for all lines
  //    first, then fallbacks. Credited positives may only match strictly
  //    (exact / date-less) so a historical pair can't grab an unrelated line.
  const prevMatcher = makeMatcher(prevLines, 2)
  const prevForCo = new Map<string, ScopeItem>() // coPos.id → prev line
  for (const lvl of [0, 1, 2] as KeyLevel[]) {
    for (const c of coPos) {
      if (prevForCo.has(c.id)) continue
      if (pairedPosIds.has(c.id) && lvl > 1) continue
      const hit = prevMatcher.take(c, lvl)
      if (hit) prevForCo.set(c.id, hit)
    }
  }

  // 3. Credits without a CO partner: match a previous line directly (delta CO),
  //    else flag as unmatched.
  const directRemovals: Array<{ credit: ScopeItem; prev: ScopeItem }> = []
  const unmatched: ScopeItem[] = []
  const removedPrevIds = new Set<string>()
  const claimed = new Set([...prevForCo.values()].map(p => p.id))
  const directMatcher = makeMatcher(prevLines.filter(p => !claimed.has(p.id)), 1)
  for (const credit of loneCredits) {
    const prev = directMatcher.take(credit, 1)
    if (prev) { directRemovals.push({ credit, prev }); removedPrevIds.add(prev.id) }
    else unmatched.push(credit)
  }

  const coRcvByPrev = new Map<string, number>()
  const pairByPrev = new Map<string, ScopeItem>() // prev id → credit
  const historicalPairs: Array<{ pos: ScopeItem; credit: ScopeItem }> = []
  for (const { credit, pos } of creditPairs) {
    const prev = prevForCo.get(pos.id)
    if (prev) { removedPrevIds.add(prev.id); pairByPrev.set(prev.id, credit); coRcvByPrev.set(prev.id, pos.rcv) }
    else historicalPairs.push({ pos, credit }) // pair already resolved before (not in prev clean scope)
  }
  for (const [coId, prev] of prevForCo) {
    if (!pairedPosIds.has(coId)) coRcvByPrev.set(prev.id, coPos.find(c => c.id === coId)!.rcv)
  }
  for (const { credit, prev } of directRemovals) pairByPrev.set(prev.id, credit)

  const matchedCoPosIds = new Set(prevForCo.keys())
  const newItems = coPos.filter(c => !matchedCoPosIds.has(c.id) && !pairedPosIds.has(c.id))

  // 3. Build output in previous order; inject per-room extras after each room.
  const extrasByRoom = new Map<string, ScopeItem[]>()
  const pushExtra = (room: string, it: ScopeItem) => {
    const b = extrasByRoom.get(room); if (b) b.push(it); else extrasByRoom.set(room, [it])
  }
  for (const { pos, credit } of historicalPairs) {
    pushExtra(pos.room, { ...pos, changeTag: 'removed' })
    pushExtra(pos.room, { ...credit, changeTag: 'removed' })
  }
  for (const n of newItems) pushExtra(n.room, { ...n, changeTag: 'new' })
  for (const u of unmatched) pushExtra(u.room, { ...u, changeTag: undefined, unmatchedCredit: true })

  const result: ScopeItem[] = []
  for (let i = 0; i < prevItems.length; i++) {
    const item = prevItems[i]
    if (item.isHeader) { result.push({ ...item, changeTag: undefined }); continue }
    if (removedPrevIds.has(item.id)) {
      const credit = pairByPrev.get(item.id)
      result.push({ ...item, rcv: credit ? Math.abs(credit.rcv) : item.rcv, changeTag: 'removed' })
      if (credit) result.push({ ...credit, changeTag: 'removed' })
    } else {
      result.push({ ...item, rcv: coRcvByPrev.get(item.id) ?? item.rcv, changeTag: undefined })
    }
    const next = prevItems.slice(i + 1).find(j => !j.isHeader)
    if (!next || next.room !== item.room) {
      const extras = extrasByRoom.get(item.room)
      if (extras) { result.push(...extras); extrasByRoom.delete(item.room) }
    }
  }
  for (const [room, extras] of extrasByRoom) {
    {
      const header = coItems.find(h => h.isHeader && h.room === room)
      if (header) result.push({ ...header, changeTag: extras.some(e => e.changeTag === 'new') ? 'new' : undefined })
      result.push(...extras)
    }
  }
  return result
}
