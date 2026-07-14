import { useState } from 'react'
import type { PurchaseOrder, POStatus, ScopeItem } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const statusConfig: Record<POStatus, { label: string; pill: string }> = {
  draft:    { label: 'Draft',    pill: 'bg-slate-100 text-slate-600 border border-slate-200' },
  approved: { label: 'Approved', pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  paid:     { label: 'Paid',     pill: 'bg-blue-50 text-blue-700 border border-blue-200' },
}

interface Props {
  po: PurchaseOrder
  projectName?: string
  subName?: string
  canDelete?: boolean
  canChangeStatus?: boolean
  lineItems?: ScopeItem[]
  onDelete?: (id: string) => void
  onStatusChange?: (id: string, status: POStatus) => void
}

export function POCard({ po, projectName, subName, canDelete, canChangeStatus, lineItems, onDelete, onStatusChange }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cfg = statusConfig[po.status]
  const poNumber = po.poNumber ?? po.title
  const docs = po.documents ?? []
  const itemCount = po.lineItemIds?.length ?? 0
  const canExpand = (lineItems?.length ?? 0) > 0

  function handleViewItems() {
    if (window.innerWidth < 640) {
      setShowSheet(v => !v)
    } else {
      setExpanded(v => !v)
    }
  }

  const isSheetOpen = showSheet && canExpand
  const isInlineOpen = expanded && canExpand

  return (
    <>
      <div className="card p-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-900">{poNumber}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.pill}`}>{cfg.label}</span>
            </div>
            {projectName && <p className="text-xs text-slate-400 mt-0.5 truncate">{projectName}</p>}
            {subName && <p className="text-xs text-slate-500 mt-0.5">{subName}</p>}
          </div>
          <p className="text-base font-semibold text-slate-900 flex-shrink-0">{fmt(po.amount)}</p>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {itemCount > 0 && <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>}
          {docs.length > 0 && <span>{docs.length} attachment{docs.length !== 1 ? 's' : ''}</span>}
          <span>{new Date(po.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          {canExpand && (
            <button onClick={handleViewItems} className="ml-auto text-blue-500 hover:text-blue-600">
              {(isInlineOpen || isSheetOpen) ? 'Hide items' : 'View items'}
            </button>
          )}
        </div>

        {/* Inline expanded line items — desktop only */}
        {isInlineOpen && (
          <div className="flex flex-col divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {lineItems!.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{item.description}</p>
                  <p className="text-[11px] text-slate-400">{item.activity} · {item.room.replace(/_/g, ' ')}</p>
                </div>
                <p className="text-xs font-semibold text-slate-800 flex-shrink-0">{fmt(item.rcv)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {po.notes && <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">{po.notes}</p>}

        {/* Documents */}
        {docs.length > 0 && (
          <div className="flex flex-col gap-1">
            {docs.map(doc => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-blue-50 rounded-lg text-xs text-blue-600 hover:text-blue-700 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="flex-1 truncate">{doc.name}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            ))}
          </div>
        )}

        {/* Status controls */}
        {canChangeStatus && (
          <div className="flex gap-2">
            {(['draft', 'approved', 'paid'] as POStatus[]).map(s => (
              <button
                key={s}
                onClick={() => onStatusChange?.(po.id, s)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${po.status === s ? statusConfig[s].pill : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
              >
                {statusConfig[s].label}
              </button>
            ))}
          </div>
        )}

        {/* Delete */}
        {canDelete && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors self-start"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Delete PO
          </button>
        )}
        {canDelete && confirmDelete && (
          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-xs text-red-700 flex-1">Delete this PO? This cannot be undone.</p>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            <button onClick={() => onDelete?.(po.id)} className="text-xs font-semibold text-red-600 hover:text-red-700">Delete</button>
          </div>
        )}
      </div>

      {/* Mobile bottom sheet for line items */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSheet(false)} />
          <div className="relative bg-white w-full rounded-t-2xl shadow-2xl" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{poNumber}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{lineItems!.length} item{lineItems!.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowSheet(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="overflow-auto max-h-[60vh] divide-y divide-slate-100">
              {lineItems!.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{item.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{item.activity} · {item.room.replace(/_/g, ' ')}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 flex-shrink-0">{fmt(item.rcv)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
