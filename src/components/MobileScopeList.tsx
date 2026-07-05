import { useState } from 'react'
import type { ScopeItem, Subcontractor } from '../types'
import { useStore } from '../store/useStore'
import { PhotoUploader } from './PhotoUploader'

interface Props {
  projectId: string
  items: ScopeItem[]
  subcontractors: Subcontractor[]
  roomFilter: string
  onOpenComment: (itemId: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function MobileScopeList({ projectId, items, subcontractors, roomFilter, onOpenComment }: Props) {
  const { toggleItem, assignSubcontractor } = useStore()
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'complete'>('all')
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const roomFiltered = items.filter(i => roomFilter === 'all' || i.room === roomFilter)
  const dataItems = roomFiltered.filter(i => !i.isHeader)

  const filtered = dataItems.filter(item => {
    if (statusFilter === 'pending' && item.completed) return false
    if (statusFilter === 'complete' && !item.completed) return false
    if (search && !item.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const completedCount = dataItems.filter(i => i.completed).length
  const pct = dataItems.length ? Math.round(completedCount / dataItems.length * 100) : 0

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Progress bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-slate-500 flex-shrink-0">{completedCount}/{dataItems.length}</span>
      </div>

      {/* Filter + search */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
        {(['all', 'pending', 'complete'] as const).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Done'}
          </button>
        ))}
        <div className="relative ml-auto">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-full w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">No items</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(item => {
              const expanded = expandedIds.has(item.id)
              const sub = subcontractors.find(s => s.id === item.subcontractorId)
              return (
                <div key={item.id} className={item.completed ? 'bg-green-50/40' : 'bg-white'}>
                  {/* Card row */}
                  <div className="flex items-start gap-3 px-4 py-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleItem(projectId, item.id)}
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        item.completed ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300'
                      }`}
                    >
                      {item.completed && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>

                    {/* Info — tappable to expand */}
                    <button className="flex-1 text-left min-w-0" onClick={() => toggleExpand(item.id)}>
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium leading-snug ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {item.description}
                        </p>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">#{item.rowNum}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                        {item.activity && <span className="text-[11px] text-slate-400">{item.activity}</span>}
                        {item.qty > 0 && <span className="text-[11px] text-slate-400">{item.qty} {item.unit}</span>}
                        {item.rcv > 0 && <span className="text-[11px] font-semibold text-slate-600">{fmt(item.rcv)}</span>}
                        {item.photos.length > 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-blue-500">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                            {item.photos.length}
                          </span>
                        )}
                        {item.comment && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                          </svg>
                        )}
                        {sub && <span className="text-[11px] text-purple-500">{sub.name}</span>}
                      </div>
                    </button>

                    {/* Expand chevron */}
                    <button onClick={() => toggleExpand(item.id)} className="flex-shrink-0 mt-1 text-slate-300 p-1">
                      <svg
                        width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  </div>

                  {/* Expanded panel */}
                  {expanded && (
                    <div className="px-4 pb-4 pt-2 bg-slate-50/60 border-t border-slate-100 space-y-3">
                      {item.note && (
                        <p className="text-xs text-slate-500 italic leading-relaxed">Note: {item.note}</p>
                      )}

                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Photos</p>
                        <PhotoUploader projectId={projectId} itemId={item.id} photos={item.photos} />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => onOpenComment(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 bg-white"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                          </svg>
                          {item.comment ? 'Edit comment' : 'Add comment'}
                        </button>
                        {subcontractors.length > 0 && (
                          <select
                            value={item.subcontractorId ?? ''}
                            onChange={e => assignSubcontractor(projectId, [item.id], e.target.value || null)}
                            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 bg-white focus:outline-none"
                          >
                            <option value="">No subcontractor</option>
                            {subcontractors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        )}
                      </div>

                      {item.comment && (
                        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-xs text-amber-800 leading-relaxed">{item.comment}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
