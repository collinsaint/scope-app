import { useState, useRef, useEffect } from 'react'
import type { ScopeItem, Subcontractor } from '../types'
import { useStore } from '../store/useStore'
import { uploadPhotoToOneDrive } from '../lib/oneDrive'
import { CameraCapture } from './CameraCapture'

interface Props {
  projectId: string
  items: ScopeItem[]
  subcontractors: Subcontractor[]
  roomFilter: string
  onOpenComment: (itemId: string) => void
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtQty(n: number) {
  return Number(n.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function roomLabel(r: string) {
  return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function activityLabel(a: string): string {
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

// Stamps project name + timestamp onto a photo (mirrors WalkView behavior)
async function stampPhoto(file: File, projectName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objUrl)
      const MAX_DIM = 2048
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const ts = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      const label = `${projectName}  ·  ${ts}`
      const fontSize = Math.max(14, Math.round(w / 50))
      const pad = Math.round(fontSize * 0.6)
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`
      const tw = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(w - tw - pad * 2, h - fontSize - pad * 2, tw + pad * 2, fontSize + pad * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, w - tw - pad, h - pad)
      const webp = canvas.toDataURL('image/webp', 0.88)
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = reject
    img.src = objUrl
  })
}

export function MobileScopeList({ projectId, items, subcontractors, roomFilter, onOpenComment }: Props) {
  const { toggleItem, assignSubcontractor, addPhoto, removePhoto, oneDrive, bulkComplete } = useStore()
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'complete'>('all')
  const [coverageFilter, setCoverageFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [photoModalItemId, setPhotoModalItemId] = useState<string | null>(null)
  const [noteModalItem, setNoteModalItem] = useState<{ description: string; note: string } | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showSearch) {
      setSearchDraft(search)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [showSearch])

  const roomFiltered = items.filter(i => {
    if (roomFilter !== 'all' && i.room !== roomFilter) return false
    if (!i.isHeader && i.coverage?.toUpperCase() === 'DRV') return false
    return true
  })
  const dataItems = roomFiltered.filter(i => !i.isHeader)
  const coverageOptions = [...new Set(dataItems.map(i => i.coverage).filter(Boolean))] as string[]

  const filtered = dataItems.filter(item => {
    if (statusFilter === 'pending' && item.completed) return false
    if (statusFilter === 'complete' && !item.completed) return false
    if (coverageFilter !== 'all' && item.coverage !== coverageFilter) return false
    if (search && !item.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const completedCount = dataItems.filter(i => i.completed).length
  const pct = dataItems.length ? Math.round(completedCount / dataItems.length * 100) : 0

  const groupedByRoom: Array<{ room: string; roomItems: ScopeItem[] }> = []
  for (const item of filtered) {
    const last = groupedByRoom[groupedByRoom.length - 1]
    if (!last || last.room !== item.room) {
      groupedByRoom.push({ room: item.room, roomItems: [item] })
    } else {
      last.roomItems.push(item)
    }
  }

  const photoModalItem = photoModalItemId ? dataItems.find(i => i.id === photoModalItemId) ?? null : null
  const project = useStore.getState().projects.find(p => p.id === projectId)

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function commitSearch() {
    setSearch(searchDraft)
    setShowSearch(false)
  }

  async function handlePhotoFiles(files: FileList | null) {
    if (!files || !photoModalItemId || !project) return
    setPhotoUploading(true)
    for (const file of Array.from(files)) {
      try {
        const data = await stampPhoto(file, project.name)
        addPhoto(projectId, photoModalItemId, data)
        if (oneDrive.connected) {
          const fileName = `${photoModalItemId}_${Date.now()}.jpg`
          uploadPhotoToOneDrive(oneDrive.rootFolderName, project.name, data, fileName).catch(() => {})
        }
      } catch { /* skip */ }
    }
    setPhotoUploading(false)
  }

  async function handleCameraCapture(dataUrls: string[]) {
    setShowCamera(false)
    if (!dataUrls.length || !photoModalItemId || !project) return
    setPhotoUploading(true)
    for (const dataUrl of dataUrls) {
      try {
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
        const stamped = await stampPhoto(file, project.name)
        addPhoto(projectId, photoModalItemId, stamped)
        if (oneDrive.connected) {
          const fileName = `${photoModalItemId}_${Date.now()}.jpg`
          uploadPhotoToOneDrive(oneDrive.rootFolderName, project.name, stamped, fileName).catch(() => {})
        }
      } catch { /* skip */ }
    }
    setPhotoUploading(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">

      {/* Search popup */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setShowSearch(false)}>
          <div className="bg-white px-4 pt-safe-top pt-4 pb-3 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  ref={searchInputRef}
                  value={searchDraft}
                  onChange={e => setSearchDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitSearch() }}
                  placeholder="Search items…"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button onClick={commitSearch} className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl flex-shrink-0">
                Search
              </button>
              <button onClick={() => { setSearchDraft(''); setSearch(''); setShowSearch(false) }} className="p-2.5 text-slate-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo modal — centered */}
      {photoModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPhotoModalItemId(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Photos</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5 leading-tight line-clamp-1">{photoModalItem.description}</p>
              </div>
              <button onClick={() => setPhotoModalItemId(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {photoModalItem.photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photoModalItem.photos.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt="" className="h-24 w-24 object-cover rounded-xl border border-slate-200" />
                      <button
                        onClick={() => removePhoto(projectId, photoModalItem.id, i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[11px] flex items-center justify-center shadow"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCamera(true)}
                  disabled={photoUploading}
                  className="flex-1 flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed border-blue-300 bg-blue-50 rounded-xl text-blue-600 disabled:opacity-50"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span className="text-xs font-semibold">Take Photo</span>
                </button>
                <button
                  onClick={() => galleryRef.current?.click()}
                  disabled={photoUploading}
                  className="flex-1 flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl text-slate-500 disabled:opacity-50"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span className="text-xs font-semibold">{photoUploading ? 'Uploading…' : 'Upload'}</span>
                </button>
              </div>
            </div>
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => { handlePhotoFiles(e.target.files); e.target.value = '' }} />
          </div>
        </div>
      )}

      {/* Camera (CameraCapture — fullscreen, z-[60]) */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Item Note modal — centered */}
      {noteModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setNoteModalItem(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/>
                  </svg>
                </div>
                <span className="text-sm font-semibold text-slate-800">Item Note</span>
              </div>
              <button onClick={() => setNoteModalItem(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] text-slate-400 mb-2 font-medium">{noteModalItem.description}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{noteModalItem.note}</p>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3 flex-shrink-0">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-slate-500 flex-shrink-0">{completedCount}/{dataItems.length} · {pct}%</span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1 flex-shrink-0">
          {(['all', 'pending', 'complete'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Complete'}
            </button>
          ))}
        </div>
        {coverageOptions.length > 0 && (
          <select
            value={coverageFilter}
            onChange={e => setCoverageFilter(e.target.value)}
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none flex-shrink-0"
          >
            <option value="all">All Coverage</option>
            {coverageOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {/* Search icon only */}
        <button
          onClick={() => setShowSearch(true)}
          className={`ml-auto p-2 rounded-full border transition-colors flex-shrink-0 ${
            search ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 bg-white'
          }`}
          title="Search"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">No items</div>
        ) : (
          <div>
            {groupedByRoom.map(group => (
              <div key={group.room}>
                {/* Sticky room header with Complete All button */}
                <div className="sticky top-0 z-10 px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest flex-1 min-w-0 truncate">
                    {roomLabel(group.room)}
                  </span>
                  {group.roomItems.some(i => !i.completed) && (
                    <button
                      onClick={() => {
                        const ids = group.roomItems.filter(i => !i.completed).map(i => i.id)
                        if (ids.length) bulkComplete(projectId, ids)
                      }}
                      className="text-[10px] font-medium text-slate-500 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-green-50 hover:border-green-300 hover:text-green-600 transition-colors flex-shrink-0 whitespace-nowrap"
                    >
                      Complete All
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-100">
                  {group.roomItems.map(item => {
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

                          {/* Description + pills */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium leading-snug ${item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {item.description}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1.5">
                              {item.activity && (
                                <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${activityColorClass(item.activity)}`}>
                                  {activityLabel(item.activity)}
                                </span>
                              )}
                              {item.qty > 0 && <span className="text-[11px] text-slate-400">{fmtQty(item.qty)} {item.unit}</span>}
                              {item.rcv > 0 && <span className="text-[11px] font-semibold text-slate-600">{fmt(item.rcv)}</span>}
                              {item.coverage && (
                                <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${coverageColorClass(item.coverage)}`}>
                                  {item.coverage}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            {/* Photo button */}
                            <button
                              onClick={() => setPhotoModalItemId(item.id)}
                              className={`flex items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                                item.photos.length > 0
                                  ? 'border-blue-200 bg-blue-50 text-blue-600'
                                  : 'border-slate-200 text-slate-400 bg-white'
                              }`}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                              </svg>
                              {item.photos.length > 0 && <span>{item.photos.length}</span>}
                            </button>

                            {/* Comment button */}
                            <button
                              onClick={() => onOpenComment(item.id)}
                              className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                                item.comment
                                  ? 'border-blue-200 bg-blue-50 text-blue-600'
                                  : 'border-slate-200 text-slate-400 bg-white'
                              }`}
                              title={item.comment || 'Add comment'}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                              </svg>
                            </button>

                            {/* Item Note button — only if note exists */}
                            {item.note && (
                              <button
                                onClick={() => setNoteModalItem({ description: item.description, note: item.note })}
                                className="flex items-center justify-center w-8 h-8 rounded-lg border border-amber-200 bg-amber-50 text-amber-600"
                                title="Item Note"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/>
                                </svg>
                              </button>
                            )}

                            {/* Expand chevron (subcontractor) */}
                            <button onClick={() => toggleExpand(item.id)} className="flex-shrink-0 text-slate-300 p-1">
                              <svg
                                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                              >
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>
                          </div>

                          {/* Line item # — always far right */}
                          <span className="text-[11px] text-slate-400 flex-shrink-0 mt-0.5 ml-0.5">#{item.rowNum}</span>
                        </div>

                        {/* Expanded panel — subcontractor + comment preview */}
                        {expanded && (
                          <div className="px-4 pb-3 pt-2 bg-slate-50/60 border-t border-slate-100 space-y-2.5">
                            {subcontractors.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-slate-400">Assign:</span>
                                <select
                                  value={item.subcontractorId ?? ''}
                                  onChange={e => assignSubcontractor(projectId, [item.id], e.target.value || null)}
                                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 bg-white focus:outline-none"
                                >
                                  <option value="">No subcontractor</option>
                                  {subcontractors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                {sub && <span className="text-[11px] text-purple-500 font-medium">{sub.name}</span>}
                              </div>
                            )}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
