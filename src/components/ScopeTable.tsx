import { useState, useRef, useEffect } from 'react'
import type { ScopeItem, Subcontractor } from '../types'
import { useStore } from '../store/useStore'
import { PhotoUploader } from './PhotoUploader'
import { MobileScopeList } from './MobileScopeList'
import { useViewMode } from '../hooks/useViewMode'

const COL_COUNT = 12

type RenderRow = ScopeItem | { _roomHeader: true; room: string; id: string }

function roomLabel(r: string) {
  return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function withRoomHeaders(items: ScopeItem[], roomFilter: string): RenderRow[] {
  const result: RenderRow[] = []
  if (roomFilter !== 'all') {
    // Single room — inject one sticky room header at the top
    if (items.some(i => !i.isHeader)) {
      result.push({ _roomHeader: true, room: roomFilter, id: `__room_${roomFilter}` })
    }
    result.push(...items)
    return result
  }
  let lastRoom: string | null = null
  let sectionIdx = 0
  for (const item of items) {
    if (item.room !== lastRoom) {
      result.push({ _roomHeader: true, room: item.room, id: `__room_${item.room}_${sectionIdx++}` })
      lastRoom = item.room
    }
    result.push(item)
  }
  return result
}

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

function activityColorClass(a: string): string {
  const map: Record<string, string> = {
    'Remove and Replace': 'bg-slate-200 text-slate-700',
    'Remove': 'bg-slate-100 text-slate-600',
    'Replace': 'bg-gray-100 text-gray-500',
  }
  return map[a] ?? 'bg-slate-50 text-slate-400'
}

const COVERAGE_PALETTE = [
  'bg-violet-50 text-violet-500',
  'bg-purple-50 text-purple-500',
  'bg-indigo-50 text-indigo-500',
  'bg-violet-100 text-violet-600',
  'bg-purple-100 text-purple-600',
  'bg-fuchsia-50 text-fuchsia-500',
  'bg-indigo-100 text-indigo-600',
  'bg-fuchsia-100 text-fuchsia-600',
]

function coverageColorClass(coverage: string): string {
  let hash = 0
  for (const ch of coverage) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return COVERAGE_PALETTE[hash % COVERAGE_PALETTE.length]
}

function pruneOrphanedHeaders(items: ScopeItem[]): ScopeItem[] {
  const result: ScopeItem[] = []
  for (let i = 0; i < items.length; i++) {
    if (!items[i].isHeader) { result.push(items[i]); continue }
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

interface Props {
  projectId: string
  items: ScopeItem[]
  subcontractors: Subcontractor[]
  roomFilter: string
  onOpenComment: (itemId: string) => void
  isSubUser?: boolean
  canApprove?: boolean
  subOrgName?: string
  subPercentage?: number
  currentUserName?: string
}

export function ScopeTable({ projectId, items, subcontractors, roomFilter, onOpenComment, isSubUser = false, canApprove = true, subOrgName, subPercentage, currentUserName }: Props) {
  const { isMobile } = useViewMode()
  const { toggleItem, assignSubcontractor, bulkComplete, bulkUncomplete, setPendingApproval, approveItem, rejectItem, returnItem, bulkSetPending, bulkApproveItems } = useStore()
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'complete'>('all')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSubId, setBulkSubId] = useState('')
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [confirmUncomplete, setConfirmUncomplete] = useState(false)
  const [photoModalItem, setPhotoModalItem] = useState<ScopeItem | null>(null)
  const [noteModalItem, setNoteModalItem] = useState<ScopeItem | null>(null)
  const [coverageFilter, setCoverageFilter] = useState('all')
  const masterRef = useRef<HTMLInputElement>(null)

  // Compute filtering unconditionally — must appear before any early return to keep hook order stable
  // DRV coverage items are excluded from display and totals everywhere
  const roomFiltered = items.filter(item => {
    if (roomFilter !== 'all' && item.room !== roomFilter) return false
    if (!item.isHeader && item.coverage?.toUpperCase() === 'DRV') return false
    return true
  })
  const dataItems = roomFiltered.filter(i => !i.isHeader)
  const coverageOptions = [...new Set(dataItems.map(i => i.coverage).filter(Boolean))] as string[]
  const completedCount = dataItems.filter(i => i.completed).length
  const pendingCount = dataItems.length - completedCount
  const totalCount = dataItems.length

  const afterFilter = roomFiltered.filter(item => {
    if (item.isHeader) return true
    if (statusFilter === 'pending' && item.completed) return false
    if (statusFilter === 'complete' && !item.completed) return false
    if (coverageFilter !== 'all' && item.coverage !== coverageFilter) return false
    if (search && !item.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const visible = pruneOrphanedHeaders(afterFilter)
  const visibleData = visible.filter(i => !i.isHeader)
  const visibleDataIds = new Set(visibleData.map(i => i.id))
  const effectiveSelected = new Set([...selectedIds].filter(id => visibleDataIds.has(id)))
  const allSelected = visibleData.length > 0 && visibleData.every(i => effectiveSelected.has(i.id))
  const someSelected = !allSelected && visibleData.some(i => effectiveSelected.has(i.id))

  useEffect(() => { setSelectedIds(new Set()); setCoverageFilter('all') }, [roomFilter])
  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someSelected
  }, [someSelected])

  if (isMobile) {
    return <MobileScopeList projectId={projectId} items={items} subcontractors={subcontractors} roomFilter={roomFilter} isSubUser={isSubUser} canApprove={canApprove} subOrgName={subOrgName} subPercentage={subPercentage} currentUserName={currentUserName} />
  }

  function handleItemToggle(item: ScopeItem) {
    if (isSubUser) {
      if (item.returned) {
        setPendingApproval(projectId, item.id, true)
      } else if (item.pendingApproval) {
        rejectItem(projectId, item.id)
      } else if (!item.completed) {
        setPendingApproval(projectId, item.id, true)
      }
    } else {
      toggleItem(projectId, item.id)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        visibleData.forEach(i => next.delete(i.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        visibleData.forEach(i => next.add(i.id))
        return next
      })
    }
  }

  function handleBulkAssign() {
    if (!effectiveSelected.size) return
    assignSubcontractor(projectId, [...effectiveSelected], bulkSubId || null)
    setSelectedIds(new Set())
    setBulkSubId('')
  }

  function handleBulkComplete() {
    if (isSubUser) {
      bulkSetPending(projectId, [...effectiveSelected])
    } else {
      bulkComplete(projectId, [...effectiveSelected])
    }
    setSelectedIds(new Set())
    setConfirmComplete(false)
  }

  function handleBulkUncomplete() {
    bulkUncomplete(projectId, [...effectiveSelected])
    setSelectedIds(new Set())
    setConfirmUncomplete(false)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'pending', 'complete'] as const).map(f => {
            const label =
              f === 'all' ? `All (${totalCount})` :
              f === 'complete' ? `Complete (${completedCount})` :
              `Pending (${pendingCount})`
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  statusFilter === f ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        {coverageOptions.length > 0 && (
          <select
            value={coverageFilter}
            onChange={e => setCoverageFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Coverage</option>
            {coverageOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Bulk action bar */}
      {effectiveSelected.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-50 border-b border-blue-100">
          <span className="text-xs font-medium text-blue-700">
            {effectiveSelected.size} item{effectiveSelected.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-blue-500 hover:text-blue-700 underline"
          >
            Clear
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setConfirmComplete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {isSubUser ? 'Request Approval' : 'Mark complete'}
          </button>
          {!isSubUser && (
            <>
              <button
                onClick={() => setConfirmUncomplete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                Mark incomplete
              </button>
              {canApprove && (() => {
                const pendingSelected = [...effectiveSelected].filter(id => {
                  const item = visibleData.find(i => i.id === id)
                  return item?.pendingApproval
                })
                return pendingSelected.length > 0 ? (
                  <button
                    onClick={() => { bulkApproveItems(projectId, pendingSelected, currentUserName); setSelectedIds(new Set()) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    Approve ({pendingSelected.length})
                  </button>
                ) : null
              })()}
            </>
          )}
          <div className="w-px h-4 bg-blue-200" />
          <span className="text-xs text-slate-500">Assign to:</span>
          <select
            value={bulkSubId}
            onChange={e => setBulkSubId(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— None —</option>
            {subcontractors.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={handleBulkAssign}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Assign
          </button>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmComplete(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{isSubUser ? 'Request approval' : 'Mark items as complete'}</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5 pl-12">
              {isSubUser
                ? <>Submit <span className="font-semibold text-slate-700">{effectiveSelected.size} item{effectiveSelected.size !== 1 ? 's' : ''}</span> for approval?</>
                : <>Mark <span className="font-semibold text-slate-700">{effectiveSelected.size} item{effectiveSelected.size !== 1 ? 's' : ''}</span> as complete? Today's date will be recorded as the completion date.</>
              }
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmComplete(false)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkComplete}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm incomplete modal */}
      {confirmUncomplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmUncomplete(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Reverse completion status</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5 pl-12">
              Mark <span className="font-semibold text-slate-700">{effectiveSelected.size} item{effectiveSelected.size !== 1 ? 's' : ''}</span> as incomplete? Their completion dates will be cleared.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmUncomplete(false)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUncomplete}
                className="px-4 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo modal */}
      {photoModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPhotoModalItem(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Photos</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5 leading-tight">{photoModalItem.description}</p>
              </div>
              <button onClick={() => setPhotoModalItem(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="p-5">
              <PhotoUploader projectId={projectId} itemId={photoModalItem.id} photos={photoModalItem.photos} />
            </div>
          </div>
        </div>
      )}

      {/* Note modal */}
      {noteModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNoteModalItem(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-800">Item Note</p>
              </div>
              <button onClick={() => setNoteModalItem(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] text-slate-400 mb-1.5 font-medium">{noteModalItem.description}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{noteModalItem.note}</p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-slate-100">
              <th className="w-8 px-3 py-3 text-left">
                <input
                  ref={masterRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-slate-300 accent-blue-600 cursor-pointer"
                />
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400 whitespace-nowrap">#</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Description</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Activity</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400 whitespace-nowrap">Qty / Unit</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Amount</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400 whitespace-nowrap">Coverage</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Note</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Photos</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Subcontractor</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Status</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Comment</th>
            </tr>
          </thead>
          <tbody>
            {visibleData.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="px-6 py-12 text-center text-sm text-slate-400">
                  No items match your filters.
                </td>
              </tr>
            ) : (
              withRoomHeaders(visible, roomFilter).map(row =>
                '_roomHeader' in row ? (
                  <RoomHeaderRow
                    key={row.id}
                    room={row.room}
                    onCompleteAll={(() => {
                      const incompleteIds = visibleData.filter(i => i.room === row.room && !i.completed && !i.pendingApproval).map(i => i.id)
                      return incompleteIds.length > 0
                        ? () => isSubUser ? bulkSetPending(projectId, incompleteIds) : bulkComplete(projectId, incompleteIds)
                        : undefined
                    })()}
                    isSubUser={isSubUser}
                    onSelectAll={!isSubUser ? (() => {
                      const roomIds = visibleData.filter(i => i.room === row.room).map(i => i.id)
                      const allSel = roomIds.every(id => effectiveSelected.has(id))
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        if (allSel) roomIds.forEach(id => next.delete(id))
                        else roomIds.forEach(id => next.add(id))
                        return next
                      })
                    }) : undefined}
                    roomAllSelected={!isSubUser && visibleData.filter(i => i.room === row.room).length > 0 && visibleData.filter(i => i.room === row.room).every(i => effectiveSelected.has(i.id))}
                    roomSomeSelected={!isSubUser && !visibleData.filter(i => i.room === row.room).every(i => effectiveSelected.has(i.id)) && visibleData.filter(i => i.room === row.room).some(i => effectiveSelected.has(i.id))}
                  />
                ) : row.isHeader ? (
                  <HeaderRow key={row.id} label={row.description} />
                ) : (
                  <ScopeRow
                    key={row.id}
                    item={row}
                    projectId={projectId}
                    subcontractors={subcontractors}
                    selected={effectiveSelected.has(row.id)}
                    onSelect={() => toggleSelect(row.id)}
                    onToggle={() => handleItemToggle(row)}
                    onApprove={(comment) => approveItem(projectId, row.id, comment, currentUserName)}
                    onReturn={(comment) => returnItem(projectId, row.id, comment, currentUserName)}
                    onOpenComment={() => onOpenComment(row.id)}
                    onPhotoClick={() => setPhotoModalItem(row)}
                    onNoteClick={() => setNoteModalItem(row)}
                    isSubUser={isSubUser}
                    canApprove={canApprove}
                    subPercentage={subPercentage}
                  />
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RoomHeaderRow({ room, onCompleteAll, isSubUser, onSelectAll, roomAllSelected, roomSomeSelected }: {
  room: string
  onCompleteAll?: () => void
  isSubUser?: boolean
  onSelectAll?: () => void
  roomAllSelected?: boolean
  roomSomeSelected?: boolean
}) {
  const cbRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (cbRef.current) cbRef.current.indeterminate = !!roomSomeSelected
  }, [roomSomeSelected])
  return (
    <tr>
      <td colSpan={COL_COUNT} className="sticky top-[40px] z-[5] px-4 pt-4 pb-2 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          {!isSubUser && onSelectAll && (
            <input
              ref={cbRef}
              type="checkbox"
              checked={!!roomAllSelected}
              onChange={onSelectAll}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0 cursor-pointer"
            />
          )}
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">
            {roomLabel(room)}
          </span>
          <div className="flex-1 h-px bg-slate-200" />
          {onCompleteAll && (
            <button
              onClick={onCompleteAll}
              className="flex-shrink-0 text-[10px] font-medium text-slate-500 px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-green-50 hover:border-green-300 hover:text-green-600 transition-colors"
            >
              Complete All
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function HeaderRow({ label }: { label: string }) {
  return (
    <tr className="border-b border-slate-100 bg-slate-50">
      <td colSpan={COL_COUNT} className="px-4 py-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
          {label}
        </span>
      </td>
    </tr>
  )
}

interface RowProps {
  item: ScopeItem
  projectId: string
  subcontractors: Subcontractor[]
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onApprove: (comment: string) => void
  onReturn: (comment: string) => void
  onOpenComment: () => void
  onPhotoClick: () => void
  onNoteClick: () => void
  isSubUser?: boolean
  canApprove?: boolean
  subPercentage?: number
}

function ScopeRow({ item, projectId, subcontractors, selected, onSelect, onToggle, onApprove, onReturn, onOpenComment, onPhotoClick, onNoteClick, isSubUser = false, canApprove = true, subPercentage }: RowProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')

  function handleConfirm() {
    onToggle()
    setShowConfirm(false)
  }

  function handleApprove() {
    onApprove(approvalComment)
    setShowConfirm(false)
    setApprovalComment('')
  }

  function handleReturn() {
    onReturn(approvalComment)
    setShowConfirm(false)
    setApprovalComment('')
  }

  const isRemoved = item.changeTag === 'removed'
  const isNew     = item.changeTag === 'new'

  const rowBg = isRemoved
    ? { backgroundColor: '#F1F5F9', opacity: 0.75 }
    : item.returned
      ? { backgroundColor: '#FEE2E2' }
      : item.completed
        ? { backgroundColor: '#CCE7C9' }
        : item.pendingApproval
          ? { backgroundColor: '#FEF9C3' }
          : undefined

  return (
    <>
      <tr className={`border-b border-slate-50 transition-colors ${isRemoved ? '' : 'hover:bg-slate-50/60'} ${selected ? 'bg-blue-50/50' : ''}`} style={rowBg}>
        {/* Select checkbox */}
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            disabled={isRemoved}
            className="w-3.5 h-3.5 rounded border-slate-300 accent-blue-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          />
        </td>

        {/* # */}
        <td className="px-3 py-3 text-xs text-slate-400">{item.rowNum}</td>

        {/* Description */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[13px] ${isRemoved ? 'line-through text-slate-400' : item.completed ? 'text-slate-800 font-semibold' : 'text-slate-800'}`}>
              {item.description}
            </span>
            {isRemoved && (
              <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-50 text-red-600 border-red-200 tracking-wide">
                REMOVED
              </span>
            )}
            {isNew && (
              <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border bg-green-50 text-green-700 border-green-200 tracking-wide">
                NEW
              </span>
            )}
          </div>
          {item.completed && item.completedAt && (
            <p className="text-[10.5px] text-green-600 mt-0.5">
              Completed {new Date(item.completedAt).toLocaleDateString()}
            </p>
          )}
          {item.returned && item.returnComment && (
            <p className="text-[10.5px] text-red-600 mt-0.5 leading-snug">
              <span className="font-semibold">Returned:</span> {item.returnComment}
              {item.returnCommentBy && <span className="text-red-400"> — {item.returnCommentBy}</span>}
              {item.returnedAt && <span className="text-red-300"> · {new Date(item.returnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            </p>
          )}
          {item.completed && item.approvalComment && (
            <p className="text-[10.5px] text-green-700 mt-0.5 leading-snug">
              <span className="font-semibold">Approved:</span> {item.approvalComment}
              {item.approvalCommentBy && <span className="text-green-500"> — {item.approvalCommentBy}</span>}
              {item.completedAt && <span className="text-green-400"> · {new Date(item.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            </p>
          )}
        </td>

        {/* Activity */}
        <td className="px-3 py-3">
          {item.activity ? (
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${isRemoved ? 'bg-slate-100 text-slate-400' : activityColorClass(item.activity)}`}>
              {activityLabel(item.activity)}
            </span>
          ) : '—'}
        </td>

        {/* Qty / Unit */}
        <td className={`px-3 py-3 text-xs whitespace-nowrap ${isRemoved ? 'text-slate-400' : 'text-slate-600'}`}>
          {item.qty ? `${Number(item.qty).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${item.unit}` : '—'}
        </td>

        {/* Amount */}
        <td className="px-3 py-3 text-[13px] font-medium whitespace-nowrap">
          <span className={isRemoved ? 'text-slate-400 line-through' : item.completed ? 'text-green-600' : 'text-slate-800'}>
            {item.rcv !== 0 ? fmt(isRemoved ? item.rcv : (subPercentage != null ? item.rcv * subPercentage / 100 : item.rcv)) : '—'}
          </span>
        </td>

        {/* Coverage */}
        <td className="px-3 py-3 whitespace-nowrap">
          {item.coverage ? (
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${coverageColorClass(item.coverage)}`}>{item.coverage}</span>
          ) : '—'}
        </td>

        {/* Note */}
        <td className="px-3 py-3">
          {item.note ? (
            <button
              onClick={onNoteClick}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              title={item.note}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/>
              </svg>
              Note
            </button>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>

        {/* Photos */}
        <td className="px-3 py-3">
          <button
            onClick={onPhotoClick}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] border transition-colors ${
              item.photos.length > 0
                ? 'border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100'
                : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-300 border-dashed'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
            {item.photos.length > 0 ? `${item.photos.length} photo${item.photos.length !== 1 ? 's' : ''}` : 'Add'}
          </button>
        </td>

        {/* Subcontractor */}
        <td className="px-3 py-3">
          <SubDropdown item={item} projectId={projectId} subcontractors={subcontractors} />
        </td>

        {/* Status */}
        <td className="px-3 py-3">
          <button
            onClick={() => {
              if (item.completed && !canApprove) return
              setShowConfirm(true)
            }}
            disabled={item.completed && isSubUser && !item.returned}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap transition-colors ${
              item.completed
                ? 'bg-green-500 hover:bg-green-600 text-black'
                : item.pendingApproval
                  ? 'bg-amber-400 hover:bg-amber-500 text-amber-900'
                  : item.returned
                    ? 'bg-red-100 border border-red-400 text-red-700 hover:bg-red-200'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
            }`}
          >
            {item.completed ? 'Completed' : item.pendingApproval ? 'Pending Approval' : item.returned ? 'Returned' : 'Incomplete'}
          </button>
        </td>

        {/* Comment */}
        <td className="px-3 py-3">
          <button
            onClick={onOpenComment}
            title={item.comment ? item.comment : 'Add comment'}
            className={`relative flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
              item.comment
                ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            {item.comment && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </button>
        </td>
      </tr>

      {showConfirm && (
        <tr>
          <td colSpan={COL_COUNT} className="p-0">
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={() => { setShowConfirm(false); setApprovalComment('') }} />
              <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
                {(() => {
                  const isPending = !!item.pendingApproval
                  const isApproveAction = isPending && canApprove && !isSubUser
                  const isRejectAction = isPending && isSubUser
                  const isSubSubmit = !item.completed && !isPending && isSubUser
                  const isReturnedResubmit = !!item.returned && isSubUser
                  const iconBg = item.completed ? 'bg-slate-100' : isPending ? 'bg-amber-100' : 'bg-green-100'
                  const iconStroke = item.completed ? '#64748b' : isPending ? '#b45309' : '#16a34a'
                  const title = item.completed
                    ? 'Mark as incomplete?'
                    : isApproveAction
                      ? 'Review item'
                      : isRejectAction
                        ? 'Cancel approval request?'
                        : isReturnedResubmit
                          ? 'Re-submit for approval?'
                          : isSubSubmit
                            ? 'Submit for approval?'
                            : 'Mark as complete?'
                  const body = item.completed
                    ? ' will be reverted to incomplete and the completion date will be cleared.'
                    : isRejectAction
                      ? ' will be returned to incomplete status.'
                      : isReturnedResubmit
                        ? ' will be re-submitted to the superintendent for approval.'
                        : isSubSubmit
                          ? ' will be submitted to the superintendent for approval.'
                          : ' will be marked as complete.'
                  const btnClass = item.completed
                    ? 'bg-slate-700 hover:bg-slate-800'
                    : isPending && !isApproveAction
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-green-600 hover:bg-green-700'

                  if (isApproveAction) {
                    return (
                      <>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                            <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-1">{item.description}</p>
                          </div>
                        </div>
                        <div className="mb-4">
                          <label className="text-xs font-medium text-slate-500 mb-1.5 block">Comment (optional)</label>
                          <textarea
                            value={approvalComment}
                            onChange={e => setApprovalComment(e.target.value)}
                            placeholder="Add a note about this decision…"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            rows={2}
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setShowConfirm(false); setApprovalComment('') }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                            Cancel
                          </button>
                          <button onClick={handleReturn} className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
                            Return
                          </button>
                          <button onClick={handleApprove} className="flex-1 px-3 py-2 text-sm font-semibold text-white rounded-lg bg-green-600 hover:bg-green-700 transition-colors">
                            Approve
                          </button>
                        </div>
                      </>
                    )
                  }

                  return (
                    <>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                          {item.completed ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                      </div>
                      <p className="text-sm text-slate-500 mb-5 pl-12 leading-relaxed">
                        <span className="font-medium text-slate-700">{item.description}</span>
                        {body}
                      </p>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleConfirm} className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${btnClass}`}>
                          Confirm
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function SubDropdown({ item, projectId, subcontractors }: { item: ScopeItem; projectId: string; subcontractors: Subcontractor[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const { assignSubcontractor } = useStore()

  const current = subcontractors.find(s => s.id === item.subcontractorId)

  function handleOpen() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    setOpen(true)
  }

  function handlePick(subId: string | null) {
    assignSubcontractor(projectId, [item.id], subId)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${
          current
            ? 'text-white'
            : 'text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 bg-white hover:border-slate-300'
        }`}
        style={current ? { backgroundColor: current.color } : {}}
      >
        {current ? current.name : subcontractors.length > 0 ? 'Assign' : '—'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[160px]"
            style={{ top: pos.top, left: pos.left }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50"
              onClick={() => handlePick(null)}
            >
              None
            </button>
            {subcontractors.length > 0 && (
              <div className="border-t border-slate-100 mt-1 pt-1">
                {subcontractors.map(s => (
                  <button
                    key={s.id}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-slate-50"
                    onClick={() => handlePick(s.id)}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-700 flex-1">{s.name}</span>
                    {item.subcontractorId === s.id && (
                      <svg className="text-slate-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
