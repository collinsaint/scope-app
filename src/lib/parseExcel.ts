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

// Remove paired line items where one credits out the other.
export function cancelCreditedItems(items: ScopeItem[]): ScopeItem[] {
  const remove = new Set<string>()
  const nonHeaders = items.filter(i => !i.isHeader)

  for (let i = 0; i < nonHeaders.length; i++) {
    if (remove.has(nonHeaders[i].id)) continue
    const a = nonHeaders[i]

    for (let j = i + 1; j < nonHeaders.length; j++) {
      if (remove.has(nonHeaders[j].id)) continue
      const b = nonHeaders[j]

      const sameGroup =
        a.room === b.room &&
        a.description === b.description &&
        Math.abs(a.qty - b.qty) < 0.001

      const oppositeRcv =
        Math.abs(Math.abs(a.rcv) - Math.abs(b.rcv)) < 0.01 &&
        ((a.rcv >= 0 && b.rcv < 0) || (a.rcv < 0 && b.rcv >= 0))

      if (sameGroup && oppositeRcv) {
        remove.add(a.id)
        remove.add(b.id)
        break
      }
    }
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
  note: number
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
    note:        find('note 1', 'notes'),
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
    cols = { room: 2, description: 3, qty: 6, unit: 10, coverage: 11, activity: 12, rcv: 21, note: 35 }
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
      qty:      cols.qty >= 0      ? toNumber(row[cols.qty])                  : 0,
      unit:     cols.unit >= 0     ? String(row[cols.unit]     ?? '').trim()  : '',
      coverage: cols.coverage >= 0 ? String(row[cols.coverage] ?? '').trim()  : '',
      activity: cols.activity !== null ? String(row[cols.activity] ?? '').trim() : '',
      rcv:      toNumber(row[cols.rcv]),
      note:     cols.note >= 0     ? String(row[cols.note]     ?? '').trim()  : '',
      completed: false,
      photos: [],
    })
  }

  return {
    items: removeOrphanedHeaders(cancelCreditedItems(items)),
    hasActivity: cols.activity !== null,
  }
}

export function mergeItems(existing: ScopeItem[], incoming: ScopeItem[]): ScopeItem[] {
  const key = (i: ScopeItem) => `${i.room}||${i.description}||${i.qty}`
  const existingByKey = new Map(existing.filter(i => !i.isHeader).map(item => [key(item), item]))

  return incoming.map(item => {
    if (item.isHeader) return item
    const prev = existingByKey.get(key(item))
    if (prev) {
      return { ...item, completed: prev.completed, completedAt: prev.completedAt, photos: prev.photos }
    }
    return item
  })
}
