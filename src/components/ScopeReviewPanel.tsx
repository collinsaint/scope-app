import { useState } from 'react'
import type { Project } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Change-order review notices shown above the scope (contractor only):
 *  - CO credits that matched no scope line (shown as flagged rows, included in the total, not counted)
 *  - Lines that were completed before a CO credited them out
 */
export function ScopeReviewPanel({ project }: { project: Project }) {
  const [open, setOpen] = useState<'unmatched' | 'ctc' | null>(null)
  const unmatched = project.items.filter(i => i.unmatchedCredit)
  const ctc = project.completedThenCredited ?? []
  if (!unmatched.length && !ctc.length) return null
  const subName = (id?: string) => (id && project.subcontractors?.find(s => s.id === id)?.name) || '—'

  return (
    <div className="flex flex-col gap-0 border-b border-slate-200 text-sm">
      {unmatched.length > 0 && (
        <div className="px-4 py-2 bg-amber-50">
          <button className="w-full flex items-center gap-2 text-left" onClick={() => setOpen(open === 'unmatched' ? null : 'unmatched')}>
            <span className="text-amber-500">⚠</span>
            <span className="font-semibold text-amber-800 flex-1">
              {unmatched.length} change-order credit{unmatched.length !== 1 ? 's' : ''} didn't match any scope line ({fmt(unmatched.reduce((s, i) => s + i.rcv, 0))}) — shown in amber in its room and included in the total so it matches Xactimate. Not counted as an item. Review with CM
            </span>
            <span className="text-amber-600 text-xs">{open === 'unmatched' ? 'Hide' : 'Show'}</span>
          </button>
          {open === 'unmatched' && (
            <ul className="mt-2 space-y-1 text-amber-900 text-xs">
              {unmatched.map(i => (
                <li key={i.id} className="flex gap-3"><span className="w-32 shrink-0 text-amber-700">{i.room}</span><span className="flex-1">{i.description} ({i.qty} {i.unit}, {i.date})</span><span className="font-mono">{fmt(i.rcv)}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {ctc.length > 0 && (
        <div className="px-4 py-2 bg-slate-50">
          <button className="w-full flex items-center gap-2 text-left" onClick={() => setOpen(open === 'ctc' ? null : 'ctc')}>
            <span className="text-slate-500">ⓘ</span>
            <span className="font-semibold text-slate-800 flex-1">
              Completed then credited: {ctc.length} line{ctc.length !== 1 ? 's' : ''} ({fmt(ctc.reduce((s, c) => s + c.rcv, 0))})
            </span>
            <span className="text-slate-500 text-xs">{open === 'ctc' ? 'Hide' : 'Show'}</span>
          </button>
          {open === 'ctc' && (
            <table className="mt-2 w-full text-xs text-slate-700">
              <thead><tr className="text-left text-slate-400"><th className="font-medium py-1">Room</th><th className="font-medium">Description</th><th className="font-medium">Sub</th><th className="font-medium text-right">Amount</th><th className="font-medium text-right">Completed</th></tr></thead>
              <tbody>
                {ctc.map(c => (
                  <tr key={c.itemId} className="border-t border-slate-100">
                    <td className="py-1 pr-2">{c.room}</td>
                    <td className="pr-2">{c.description}</td>
                    <td className="pr-2">{subName(c.subcontractorId)}</td>
                    <td className="text-right font-mono">{fmt(c.rcv)}</td>
                    <td className="text-right">{c.completedAt ? new Date(c.completedAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
