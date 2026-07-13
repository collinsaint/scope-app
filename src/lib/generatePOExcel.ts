import * as XLSX from 'xlsx'
import type { ScopeItem } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtQty(n: number) {
  return parseFloat(n.toFixed(2)).toString()
}

export function generatePOExcel(items: ScopeItem[]): Blob {
  const wb = XLSX.utils.book_new()

  // Group by room
  const grouped: Record<string, ScopeItem[]> = {}
  for (const item of items) {
    if (item.isHeader) continue
    ;(grouped[item.room] = grouped[item.room] ?? []).push(item)
  }

  const rows: (string | number)[][] = []
  rows.push(['Room', 'Description', 'Activity', 'Qty', 'Unit', 'Amount', 'Coverage', 'Note'])

  let grandTotal = 0
  for (const [room, roomItems] of Object.entries(grouped)) {
    // Room header row
    rows.push([room.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), '', '', '', '', '', '', ''])
    for (const item of roomItems) {
      rows.push([
        '',
        item.description,
        item.activity,
        fmtQty(item.qty),
        item.unit,
        fmt(item.rcv),
        item.coverage ?? '',
        item.note ?? '',
      ])
      grandTotal += item.rcv
    }
  }

  rows.push(['', '', '', '', '', '', '', ''])
  rows.push(['TOTAL', '', '', '', '', fmt(grandTotal), '', ''])

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 28 }, { wch: 42 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
    { wch: 14 }, { wch: 10 }, { wch: 30 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Purchase Order')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadPOExcel(poNumber: string, items: ScopeItem[]) {
  const blob = generatePOExcel(items)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${poNumber}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
