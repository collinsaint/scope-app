import * as XLSX from 'xlsx'
import type { ScopeItem } from '../types'

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

// Headers start with one or more dashes
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
// Two items cancel when they share the same room, description, and qty,
// and their RCV values are equal in absolute value with opposite signs.
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

// Drop headers that have no active (non-header) items between them and the
// next header in the same room. Scans the list in original row order.
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
      if (items[j].isHeader) break   // next header in same room — stop looking
      hasItems = true
      break
    }

    if (hasItems) result.push(header)
  }

  return result
}

export function parseExcelFile(buffer: ArrayBuffer): ScopeItem[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  // Locate the 'Note 1' column from the header row instead of hardcoding.
  const headerRow = (rows[0] as unknown[]) ?? []
  const noteCol = headerRow.findIndex(
    h => String(h ?? '').trim().toLowerCase() === 'note 1'
  )
  // AJ is index 35; fall back to it if the header isn't found.
  const noteIdx = noteCol >= 0 ? noteCol : 35

  const items: ScopeItem[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const desc = row[3]

    if (!desc) continue

    const room = String(row[2] ?? 'Unknown').trim()
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
      qty: toNumber(row[6]),
      unit: String(row[10] ?? '').trim(),
      coverage: String(row[11] ?? '').trim(),
      activity: String(row[12] ?? '').trim(),
      rcv: toNumber(row[21]),
      note: String(row[noteIdx] ?? '').trim(),
      completed: false,
      photos: [],
    })
  }

  return removeOrphanedHeaders(cancelCreditedItems(items))
}

export function mergeItems(existing: ScopeItem[], incoming: ScopeItem[]): ScopeItem[] {
  // Match by room+description+qty to preserve completion state across re-uploads.
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
