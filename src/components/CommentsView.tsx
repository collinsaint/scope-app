import type { ScopeItem } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function activityLabel(a: string): string {
  if (!a) return ''
  const map: Record<string, string> = {
    'Remove and Replace': 'R&R',
    'Remove': 'Remove',
    'Replace': 'Replace',
  }
  return map[a] ?? a
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

interface Props {
  items: ScopeItem[]
  onEditComment: (itemId: string) => void
}

export function CommentsView({ items, onEditComment }: Props) {
  const commented = items.filter(i => !i.isHeader && (i.comment || (i.commentNotes?.length ?? 0) > 0))

  if (commented.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600">No comments yet</p>
        <p className="text-xs text-slate-400">Click the comment icon on any line item to add a note.</p>
      </div>
    )
  }

  // Group by room
  const byRoom = commented.reduce<Record<string, ScopeItem[]>>((acc, item) => {
    ;(acc[item.room] = acc[item.room] ?? []).push(item)
    return acc
  }, {})

  return (
    <div className="flex-1 overflow-auto px-6 py-5">
      <div className="max-w-3xl space-y-8">
        {Object.entries(byRoom).map(([room, roomItems], roomIdx) => (
          <div key={`${room}-${roomIdx}`}>
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              {room}
            </h3>
            <div className="space-y-3">
              {roomItems.map(item => {
                const notes = item.commentNotes ?? []
                return (
                  <div
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex gap-4 hover:border-slate-300 transition-colors"
                  >
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                      </svg>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-[11px] text-slate-400 mb-0.5">#{item.rowNum}</p>
                          <p className="text-sm font-semibold text-slate-900">{item.description}</p>
                        </div>
                        <button
                          onClick={() => onEditComment(item.id)}
                          className="flex-shrink-0 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                        >
                          Add Note
                        </button>
                      </div>

                      {/* Line item details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                        {item.activity && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className="text-slate-300">Activity</span>
                            <span className="font-medium text-slate-600">{activityLabel(item.activity)}</span>
                          </span>
                        )}
                        {item.coverage && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className="text-slate-300">Coverage</span>
                            <span className="font-medium text-slate-600">{item.coverage}</span>
                          </span>
                        )}
                        {item.qty > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className="text-slate-300">Qty</span>
                            <span className="font-medium text-slate-600">
                              {Number(item.qty).toLocaleString('en-US', { maximumFractionDigits: 2 })} {item.unit}
                            </span>
                          </span>
                        )}
                        {item.rcv > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <span className="text-slate-300">Amount</span>
                            <span className="font-medium text-slate-700">{fmt(item.rcv)}</span>
                          </span>
                        )}
                      </div>

                      {/* Legacy single comment */}
                      {item.comment && notes.length === 0 && (
                        <p className="text-[15px] font-semibold text-slate-800 whitespace-pre-wrap leading-relaxed">
                          {item.comment}
                        </p>
                      )}

                      {/* Comment notes list */}
                      {notes.length > 0 && (
                        <div className="flex flex-col gap-2 mt-1">
                          {notes.map((n, i) => (
                            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                              {n.type && (
                                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mb-1 ${
                                  n.type === 'approval' ? 'bg-green-100 text-green-700' :
                                  n.type === 'return' ? 'bg-red-100 text-red-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {n.type === 'approval' ? 'Approved' : n.type === 'return' ? 'Returned' : 'Comment'}
                                </span>
                              )}
                              <p className="text-sm text-slate-800 leading-snug whitespace-pre-wrap">{n.text}</p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {n.by && <span className="font-medium text-slate-500">{n.by} · </span>}
                                {formatDate(n.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
