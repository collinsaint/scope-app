import { useState, useRef, useEffect } from 'react'
import type { ScopeItem, Subcontractor } from '../types'
import { useStore } from '../store/useStore'
import { CameraCapture } from './CameraCapture'
import { translateTexts } from '../lib/translate'

interface Props {
  projectId: string
  items: ScopeItem[]
  subcontractors: Subcontractor[]
  roomFilter: string
  isSubUser?: boolean
  canApprove?: boolean
  subOrgName?: string
  subPercentage?: number
  currentUserName?: string
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtQty(n: number) {
  return Number(n.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

const SPANISH_ROOMS: Record<string, string> = {
  '_general_': 'General', general: 'General',
  bedroom: 'Dormitorio', master_bedroom: 'Dormitorio Principal',
  bathroom: 'Baño', master_bathroom: 'Baño Principal', half_bath: 'Medio Baño',
  kitchen: 'Cocina', living_room: 'Sala de Estar', dining_room: 'Comedor',
  family_room: 'Sala Familiar', den: 'Sala', office: 'Oficina',
  garage: 'Garaje', laundry: 'Lavandería', laundry_room: 'Lavandería',
  basement: 'Sótano', attic: 'Ático', hallway: 'Pasillo', closet: 'Armario',
  entry: 'Entrada', entryway: 'Entrada', foyer: 'Vestíbulo',
  porch: 'Porche', patio: 'Patio', deck: 'Terraza',
  exterior: 'Exterior', interior: 'Interior', roof: 'Tejado',
  storage: 'Almacenamiento', utility_room: 'Cuarto de Servicio',
  sunroom: 'Solario', mudroom: 'Entrada de Servicio',
  staircase: 'Escalera', stairs: 'Escalera',
  elevation: 'Elevación',
  front_elevation: 'Elevación Frontal', rear_elevation: 'Elevación Trasera',
  left_elevation: 'Elevación Izquierda', right_elevation: 'Elevación Derecha',
  side_elevation: 'Elevación Lateral', back_elevation: 'Elevación Trasera',
}

function roomLabel(r: string, spanish = false) {
  if (spanish) {
    // normalize spaces to underscores so "Front Elevation" matches front_elevation
    const key = r.toLowerCase().replace(/\s+/g, '_')
    if (SPANISH_ROOMS[key]) return SPANISH_ROOMS[key]
    const m = key.match(/^(.+?)_(\d+)$/)
    if (m && SPANISH_ROOMS[m[1]]) return `${SPANISH_ROOMS[m[1]]} ${m[2]}`
  }
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

// Stamps address, line item #, and timestamp — two lines in bottom-right corner
async function stampPhoto(
  file: File,
  projectName: string,
  address?: string,
  rowNum?: number,
): Promise<string> {
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

      const fontSize = Math.max(13, Math.round(w / 55))
      const lineH = Math.round(fontSize * 1.5)
      const pad = Math.round(fontSize * 0.65)
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`

      const line1Parts = [address || projectName, rowNum != null ? `#${rowNum}` : ''].filter(Boolean)
      const line1 = line1Parts.join('  ·  ')
      const line2 = ts

      const tw1 = ctx.measureText(line1).width
      const tw2 = ctx.measureText(line2).width
      const tw = Math.max(tw1, tw2)

      const boxH = lineH * 2 + pad * 2
      const boxW = tw + pad * 2

      ctx.fillStyle = 'rgba(0,0,0,0.58)'
      ctx.fillRect(w - boxW, h - boxH, boxW, boxH)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(line1, w - boxW + pad, h - boxH + pad + fontSize)
      ctx.fillText(line2, w - boxW + pad, h - pad)

      const webp = canvas.toDataURL('image/webp', 0.88)
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = reject
    img.src = objUrl
  })
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export function MobileScopeList({ projectId, items, subcontractors, roomFilter, isSubUser = false, canApprove = true, subOrgName, subPercentage, currentUserName }: Props) {
  const { toggleItem, addPhoto, removePhoto, addRoomPhoto, removeRoomPhoto, bulkComplete, bulkUncomplete, addCommentNote, deleteCommentNote, projects, setTranslationCache, setPendingApproval, approveItem, rejectItem, returnItem, bulkSetPending, bulkClearPending, assignSubcontractor, bulkApproveItems } = useStore()
  const project = projects.find(p => p.id === projectId)
  const spanishMode = project?.spanishMode ?? false
  const translationCache = project?.translationCache ?? {}
  const [translating, setTranslating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'complete'>('all')
  const [coverageFilter, setCoverageFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [, setBulkCompletedRooms] = useState<Set<string>>(new Set())
  // Item-level photo modal
  const [photoModalItemId, setPhotoModalItemId] = useState<string | null>(null)
  // Room-level photo modal
  const [roomPhotoModal, setRoomPhotoModal] = useState<string | null>(null)
  const [noteModalItem, setNoteModalItem] = useState<{ description: string; note: string } | null>(null)
  // Camera source: 'item' or 'room'
  const [cameraSource, setCameraSource] = useState<'item' | 'room'>('item')
  const [showCamera, setShowCamera] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  // Full-screen photo viewer
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null)
  // Comment bottom sheet
  const [commentModalItemId, setCommentModalItemId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentDeleteConfirm, setCommentDeleteConfirm] = useState<number | null>(null)
  const [assignMode, setAssignMode] = useState(false)
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [subPickerItemId, setSubPickerItemId] = useState<string | null>(null)
  const [bulkSubId, setBulkSubId] = useState('')
  const [approvalModal, setApprovalModal] = useState<ScopeItem | null>(null)
  const [approvalComment, setApprovalComment] = useState('')
  const [submitConfirmItem, setSubmitConfirmItem] = useState<ScopeItem | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const roomGalleryRef = useRef<HTMLInputElement>(null)

  function toggleSelectItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleBulkAssign() {
    if (!selectedIds.size) return
    assignSubcontractor(projectId, [...selectedIds], bulkSubId || null)
    setSelectedIds(new Set())
    setBulkSubId('')
  }

  useEffect(() => {
    if (showSearch) {
      setSearchDraft(search)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [showSearch])

  useEffect(() => {
    if (!spanishMode) return
    const allDescriptions = items.filter(i => !i.isHeader && i.description).map(i => i.description)
    const allNotes = items.filter(i => !i.isHeader && i.note).map(i => i.note)
    const missing = [...new Set([...allDescriptions, ...allNotes])].filter(d => !(d in translationCache))
    if (missing.length === 0) return
    setTranslating(true)
    translateTexts(missing).then(translated => {
      const patch: Record<string, string> = {}
      missing.forEach((d, i) => { patch[d] = translated[i] })
      setTranslationCache(projectId, patch)
    }).finally(() => setTranslating(false))
  }, [spanishMode, projectId])

  // For sub users, only show items assigned to their sub org
  const mySubId = isSubUser && subOrgName
    ? subcontractors.find(s => s.name.toLowerCase() === subOrgName.toLowerCase())?.id ?? null
    : null

  const roomFiltered = items.filter(i => {
    if (roomFilter !== 'all' && i.room !== roomFilter) return false
    if (!i.isHeader && i.coverage?.toUpperCase() === 'DRV') return false
    if (mySubId !== null && !i.isHeader && i.subcontractorId !== mySubId) return false
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

  const progressItems = coverageFilter !== 'all'
    ? dataItems.filter(i => i.coverage === coverageFilter)
    : dataItems
  const completedCount = progressItems.filter(i => i.completed).length
  const pendingCount = progressItems.filter(i => i.pendingApproval && !i.completed).length
  const pctCompleted = progressItems.length ? completedCount / progressItems.length * 100 : 0
  const pctPending = progressItems.length ? pendingCount / progressItems.length * 100 : 0
  const pct = Math.round(pctCompleted + pctPending)

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

  function commitSearch() {
    setSearch(searchDraft)
    setShowSearch(false)
  }

  async function handlePhotoFiles(files: FileList | null) {
    if (!files || !photoModalItemId || !project) return
    setPhotoUploading(true)
    const item = dataItems.find(i => i.id === photoModalItemId)
    for (const file of Array.from(files)) {
      try {
        const data = await stampPhoto(file, project.name, project.address, item?.rowNum)
        addPhoto(projectId, photoModalItemId, data)
      } catch { /* skip */ }
    }
    setPhotoUploading(false)
  }

  async function handleRoomPhotoFiles(files: FileList | null) {
    if (!files || !roomPhotoModal || !project) return
    setPhotoUploading(true)
    for (const file of Array.from(files)) {
      try {
        const data = await stampPhoto(file, project.name, project.address)
        addRoomPhoto(projectId, roomPhotoModal, data)
      } catch { /* skip */ }
    }
    setPhotoUploading(false)
  }

  async function handleCameraCapture(dataUrls: string[]) {
    setShowCamera(false)
    if (!dataUrls.length || !project) return
    setPhotoUploading(true)

    if (cameraSource === 'item' && photoModalItemId) {
      const item = dataItems.find(i => i.id === photoModalItemId)
      for (const dataUrl of dataUrls) {
        try {
          const res = await fetch(dataUrl)
          const blob = await res.blob()
          const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
          const stamped = await stampPhoto(file, project.name, project.address, item?.rowNum)
          addPhoto(projectId, photoModalItemId, stamped)
        } catch { /* skip */ }
      }
    } else if (cameraSource === 'room' && roomPhotoModal) {
      for (const dataUrl of dataUrls) {
        try {
          const res = await fetch(dataUrl)
          const blob = await res.blob()
          const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
          const stamped = await stampPhoto(file, project.name, project.address)
          addRoomPhoto(projectId, roomPhotoModal, stamped)
        } catch { /* skip */ }
      }
    }
    setPhotoUploading(false)
  }

  // All photos for room modal: room-level photos + all item photos in that room
  function getRoomAllPhotos(room: string) {
    const result: Array<{ src: string; source: 'room' | 'item'; roomIdx?: number; itemId?: string; itemIdx?: number; rowNum?: number }> = []
    const rp = project?.roomPhotos?.[room] ?? []
    rp.forEach((src, i) => result.push({ src, source: 'room', roomIdx: i }))
    dataItems.filter(i => i.room === room).forEach(item => {
      item.photos.forEach((src, i) => result.push({ src, source: 'item', itemId: item.id, itemIdx: i, rowNum: item.rowNum }))
    })
    return result
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

      {/* Full-screen photo viewer */}
      {viewingPhoto && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black" onClick={() => setViewingPhoto(null)}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingPhoto(null)} className="p-2 text-white/70 hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <button
              onClick={() => downloadDataUrl(viewingPhoto, `photo_${Date.now()}.jpg`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Save
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            <img src={viewingPhoto} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}

      {/* Item-level photo modal */}
      {photoModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPhotoModalItemId(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Photos · #{photoModalItem.rowNum}</p>
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
                      <img
                        src={src} alt=""
                        className="h-24 w-24 object-cover rounded-xl border border-slate-200 cursor-pointer"
                        onClick={() => setViewingPhoto(src)}
                      />
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
                  onClick={() => { setCameraSource('item'); setShowCamera(true) }}
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

      {/* Room photo modal */}
      {roomPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRoomPhotoModal(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Room Photos</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{roomLabel(roomPhotoModal, spanishMode)}</p>
              </div>
              <button onClick={() => setRoomPhotoModal(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {(() => {
                const allPhotos = getRoomAllPhotos(roomPhotoModal)
                return (
                  <>
                    {allPhotos.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {allPhotos.map((photo, idx) => (
                          <div key={idx} className="relative">
                            <img
                              src={photo.src} alt=""
                              className="h-24 w-24 object-cover rounded-xl border border-slate-200 cursor-pointer"
                              onClick={() => setViewingPhoto(photo.src)}
                            />
                            {photo.rowNum != null && (
                              <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/50 text-white px-1 py-0.5 rounded">
                                #{photo.rowNum}
                              </span>
                            )}
                            <button
                              onClick={() => {
                                if (photo.source === 'room' && photo.roomIdx != null) {
                                  removeRoomPhoto(projectId, roomPhotoModal, photo.roomIdx)
                                } else if (photo.source === 'item' && photo.itemId != null && photo.itemIdx != null) {
                                  removePhoto(projectId, photo.itemId, photo.itemIdx)
                                }
                              }}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[11px] flex items-center justify-center shadow"
                            >×</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-4">No photos yet for this room.</p>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setCameraSource('room'); setShowCamera(true) }}
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
                        onClick={() => roomGalleryRef.current?.click()}
                        disabled={photoUploading}
                        className="flex-1 flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl text-slate-500 disabled:opacity-50"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span className="text-xs font-semibold">{photoUploading ? 'Uploading…' : 'Upload'}</span>
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
            <input ref={roomGalleryRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => { handleRoomPhotoFiles(e.target.files); e.target.value = '' }} />
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
                <span className="text-sm font-semibold text-slate-800">{spanishMode ? 'Nota del Artículo' : 'Item Note'}</span>
              </div>
              <button onClick={() => setNoteModalItem(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] text-slate-400 mb-2 font-medium">{spanishMode ? (translationCache[noteModalItem.description] ?? noteModalItem.description) : noteModalItem.description}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{spanishMode ? (translationCache[noteModalItem.note] ?? noteModalItem.note) : noteModalItem.note}</p>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3 flex-shrink-0">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${pctCompleted}%` }} />
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${pctPending}%` }} />
        </div>
        <span className="text-xs text-slate-500 flex-shrink-0">
          {coverageFilter !== 'all' && <span className="text-blue-500 font-medium">{coverageFilter} · </span>}
          {completedCount}/{progressItems.length} · {pct}%
        </span>
      </div>

      {/* Spanish mode translating indicator */}
      {spanishMode && translating && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2 flex-shrink-0">
          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <span className="text-xs text-blue-500 font-medium">Translating to Spanish…</span>
        </div>
      )}

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
            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none flex-shrink-0 max-w-[80px]"
          >
            <option value="all">Coverage</option>
            {coverageOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {/* Bulk select toggle — for approve (contractors) or request approval (subs) */}
          <button
            onClick={() => {
              setBulkSelectMode(v => {
                if (!v) { setAssignMode(false) }
                if (v) setSelectedIds(new Set())
                return !v
              })
            }}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              bulkSelectMode ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 bg-white'
            }`}
          >
            Select
          </button>
          {/* Assign toggle — contractors only */}
          {!isSubUser && subcontractors.length > 0 && (
            <button
              onClick={() => { setAssignMode(v => { if (!v) setBulkSelectMode(false); if (v) setSelectedIds(new Set()); return !v }); }}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                assignMode ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 bg-white'
              }`}
            >
              Assign
            </button>
          )}
          {/* Search */}
          <button
            onClick={() => setShowSearch(true)}
            className={`p-2 rounded-full border transition-colors ${
              search ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 bg-white'
            }`}
            title="Search"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-center px-6">
            {isSubUser && mySubId === null && subcontractors.length > 0 ? (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
                <p className="text-sm font-medium text-slate-500">No scope items assigned to you yet.</p>
                <p className="text-xs text-slate-400">Your contractor will assign items once the scope is ready.</p>
              </>
            ) : isSubUser && mySubId !== null ? (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
                <p className="text-sm font-medium text-slate-500">No scope items assigned to you yet.</p>
                <p className="text-xs text-slate-400">Your contractor will assign items once the scope is ready.</p>
              </>
            ) : (
              <p className="text-sm text-slate-400">No items</p>
            )}
          </div>
        ) : (
          <div>
            {groupedByRoom.map((group, groupIdx) => {
              const roomPhotoCount = (project?.roomPhotos?.[group.room]?.length ?? 0)
                + group.roomItems.reduce((acc, i) => acc + i.photos.length, 0)
              return (
                <div key={`${group.room}-${groupIdx}`}>
                  {/* Sticky room header */}
                  {(() => {
                    const allCompleted = group.roomItems.length > 0 && group.roomItems.every(i => i.completed)
                    const allPendingOrDone = isSubUser
                      ? group.roomItems.length > 0 && group.roomItems.every(i => i.completed || i.pendingApproval)
                      : allCompleted
                    const headerDone = allCompleted
                    return (
                      <div
                        className="sticky top-0 z-10 px-4 py-2 border-b flex items-center gap-2 transition-colors"
                        style={
                          headerDone
                            ? { background: '#dcfce7', borderColor: '#bbf7d0' }
                            : { background: '#EEEDFE', borderColor: '#CECBF6' }
                        }
                      >
                        {((!isSubUser && assignMode) || bulkSelectMode) && (() => {
                          const roomIds = group.roomItems.map(i => i.id)
                          const allSel = roomIds.length > 0 && roomIds.every(id => selectedIds.has(id))
                          const someSel = !allSel && roomIds.some(id => selectedIds.has(id))
                          return (
                            <input
                              type="checkbox"
                              checked={allSel}
                              ref={el => { if (el) el.indeterminate = someSel }}
                              onChange={() => {
                                setSelectedIds(prev => {
                                  const next = new Set(prev)
                                  if (allSel) roomIds.forEach(id => next.delete(id))
                                  else roomIds.forEach(id => next.add(id))
                                  return next
                                })
                              }}
                              className="w-4 h-4 rounded border-slate-400 text-blue-600 flex-shrink-0 cursor-pointer"
                            />
                          )
                        })()}
                        <span
                          className="text-[11px] font-bold uppercase tracking-widest flex-1 min-w-0 truncate"
                          style={{ color: headerDone ? '#15803d' : '#3C3489' }}
                        >
                          {roomLabel(group.room, spanishMode)}
                        </span>

                        {/* Room Photos button */}
                        <button
                          onClick={() => setRoomPhotoModal(group.room)}
                          className="relative text-[10px] font-medium px-2 py-1 rounded-md border transition-colors flex-shrink-0 whitespace-nowrap flex items-center gap-1"
                          style={
                            roomPhotoCount > 0
                              ? { color: '#3C3489', borderColor: '#AFA9EC', background: '#EEEDFE' }
                              : { color: '#64748b', borderColor: '#cbd5e1', background: '#fff' }
                          }
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                          </svg>
                          Photos
                          {roomPhotoCount > 0 && (
                            <span className="text-[9px] font-bold">{roomPhotoCount}</span>
                          )}
                        </button>

                        {allPendingOrDone ? (
                          <button
                            onClick={() => {
                              if (isSubUser) {
                                const pendingIds = group.roomItems.filter(i => i.pendingApproval).map(i => i.id)
                                bulkClearPending(projectId, pendingIds)
                              } else {
                                bulkUncomplete(projectId, group.roomItems.map(i => i.id))
                              }
                              setBulkCompletedRooms(prev => {
                                const next = new Set(prev)
                                next.delete(group.room)
                                return next
                              })
                            }}
                            className="text-[10px] font-medium px-2 py-1 rounded-md border transition-colors flex-shrink-0 whitespace-nowrap"
                            style={{ color: '#92400e', borderColor: '#fcd34d', background: '#fffbeb' }}
                          >
                            Undo All
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const ids = group.roomItems.filter(i => !i.completed && !i.pendingApproval).map(i => i.id)
                              if (ids.length) {
                                if (isSubUser) bulkSetPending(projectId, ids)
                                else bulkComplete(projectId, ids)
                                setBulkCompletedRooms(prev => new Set(prev).add(group.room))
                              }
                            }}
                            className="text-[10px] font-medium text-slate-500 px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-green-50 hover:border-green-300 hover:text-green-600 transition-colors flex-shrink-0 whitespace-nowrap"
                          >
                            Complete All
                          </button>
                        )}
                      </div>
                    )
                  })()}

                  <div className="divide-y divide-slate-100">
                    {group.roomItems.map(item => {
                      const assignedSub = subcontractors.find(s => s.id === item.subcontractorId)
                      const displayRcv = subPercentage != null ? item.rcv * subPercentage / 100 : item.rcv
                      const isRemoved = item.changeTag === 'removed'
                      const isNew     = item.changeTag === 'new'
                      return (
                        <div key={item.id} className={`${isRemoved ? 'bg-slate-100/80 opacity-75' : item.completed ? 'bg-green-50/40' : item.pendingApproval ? 'bg-amber-50/60' : item.returned ? 'bg-red-50/60' : 'bg-white'} ${selectedIds.has(item.id) ? 'ring-1 ring-inset ring-blue-400' : ''}`}>
                          {/* Card row */}
                          <div className="flex items-start gap-3 px-4 py-3">
                            {/* Bulk select checkbox */}
                            {((!isSubUser && assignMode) || bulkSelectMode) && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(item.id)}
                                onChange={() => toggleSelectItem(item.id)}
                                className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 flex-shrink-0 cursor-pointer"
                              />
                            )}
                            {/* Completion circle + item # below */}
                            <div className="flex flex-col items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => {
                                  if (isRemoved) return
                                  if (isSubUser) {
                                    if (item.returned) setSubmitConfirmItem(item)
                                    else if (item.pendingApproval) rejectItem(projectId, item.id)
                                    else if (!item.completed) setSubmitConfirmItem(item)
                                  } else if (item.pendingApproval && canApprove) {
                                    setApprovalModal(item)
                                  } else {
                                    toggleItem(projectId, item.id)
                                  }
                                }}
                                disabled={(item.completed && isSubUser && !item.returned) || isRemoved}
                                className={`mt-0.5 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                  isRemoved
                                    ? 'border-slate-300 bg-slate-200 cursor-not-allowed'
                                    : item.completed
                                      ? 'bg-green-500 border-green-500 text-white'
                                      : item.pendingApproval
                                        ? 'bg-amber-400 border-amber-400 text-white'
                                        : item.returned
                                          ? 'bg-red-500 border-red-500 text-white'
                                          : 'border-slate-300'
                                }`}
                              >
                                {item.completed ? (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                ) : item.pendingApproval ? (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                  </svg>
                                ) : item.returned ? (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                ) : null}
                              </button>
                              <span className="text-[10px] text-slate-400 leading-none">#{item.rowNum}</span>
                            </div>

                            {/* Description + pills */}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium leading-snug ${isRemoved ? 'line-through text-slate-400' : item.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                {spanishMode ? (translationCache[item.description] ?? item.description) : item.description}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1.5">
                                {item.activity && (
                                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${activityColorClass(item.activity)}`}>
                                    {activityLabel(item.activity)}
                                  </span>
                                )}
                                {item.qty > 0 && <span className="text-[11px] text-slate-400">{fmtQty(item.qty)} {item.unit}</span>}
                                {item.rcv > 0 && <span className="text-[11px] font-semibold text-slate-600">{fmt(displayRcv)}</span>}
                                {item.rcv < 0 && isRemoved && <span className="text-[11px] font-semibold text-red-500">{fmt(item.rcv)}</span>}
                                {item.coverage && (
                                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${coverageColorClass(item.coverage)}`}>
                                    {item.coverage}
                                  </span>
                                )}
                                {assignedSub && (
                                  <span
                                    className="text-[11px] px-1.5 py-0.5 rounded font-medium"
                                    style={{ background: assignedSub.color + '22', color: assignedSub.color }}
                                  >
                                    {assignedSub.name}
                                  </span>
                                )}
                              </div>
                              {/* Inline return/approval comment */}
                              {item.returned && item.returnComment && (
                                <p className="text-[11px] text-red-600 mt-1 leading-snug">
                                  <span className="font-semibold">Returned:</span> {item.returnComment}
                                  {item.returnCommentBy && <span className="text-red-400"> — {item.returnCommentBy}</span>}
                                  {item.returnedAt && <span className="text-red-300"> · {new Date(item.returnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                                </p>
                              )}
                              {item.completed && item.approvalComment && (
                                <p className="text-[11px] text-green-700 mt-1 leading-snug">
                                  <span className="font-semibold">Approved:</span> {item.approvalComment}
                                  {item.approvalCommentBy && <span className="text-green-500"> — {item.approvalCommentBy}</span>}
                                  {item.completedAt && <span className="text-green-400"> · {new Date(item.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                                </p>
                              )}
                            </div>

                            {/* Action buttons column — Note → Comment → Photo */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Item Note — only if note exists */}
                              {item.note && (
                                <button
                                  onClick={() => setNoteModalItem({ description: item.description, note: item.note })}
                                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-amber-200 bg-amber-50 text-amber-600"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/>
                                  </svg>
                                </button>
                              )}

                              {/* Comment */}
                              <button
                                onClick={() => { setCommentModalItemId(item.id); setCommentDraft(''); setCommentDeleteConfirm(null) }}
                                className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                                  (item.comment || (item.commentNotes?.length ?? 0) > 0)
                                    ? 'border-blue-200 bg-blue-50 text-blue-600'
                                    : 'border-slate-200 text-slate-400 bg-white'
                                }`}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                                </svg>
                              </button>

                              {/* Photo */}
                              <button
                                onClick={() => setPhotoModalItemId(item.id)}
                                className={`relative flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                                  item.photos.length > 0
                                    ? 'border-blue-200 bg-blue-50 text-blue-600'
                                    : 'border-slate-200 text-slate-400 bg-white'
                                }`}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                                  <circle cx="12" cy="13" r="4"/>
                                </svg>
                                {item.photos.length > 0 && (
                                  <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-blue-500 text-white w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none">
                                    {item.photos.length}
                                  </span>
                                )}
                              </button>
                            </div>
                          </div>
                          {/* Change-order badge row */}
                          {(isRemoved || isNew) && (
                            <div className="px-4 pb-2 flex items-center gap-1.5">
                              {isRemoved && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-red-50 text-red-600 border-red-200 tracking-wide">
                                  REMOVED
                                </span>
                              )}
                              {isNew && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200 tracking-wide">
                                  NEW
                                </span>
                              )}
                            </div>
                          )}
                          {/* Sub assignment row (contractor only, assign mode only) */}
                          {!isSubUser && assignMode && subcontractors.length > 0 && (
                            <div className="px-4 pb-2.5 flex items-center gap-2">
                              <button
                                onClick={() => setSubPickerItemId(item.id)}
                                className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors"
                                style={assignedSub
                                  ? { borderColor: assignedSub.color + '60', background: assignedSub.color + '18', color: assignedSub.color }
                                  : { borderColor: '#e2e8f0', background: '#f8fafc', color: '#94a3b8' }
                                }
                              >
                                {assignedSub
                                  ? <><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: assignedSub.color }} />{assignedSub.name}</>
                                  : <><span className="w-2 h-2 rounded-full border border-slate-300 flex-shrink-0" />Assign sub</>
                                }
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Approval modal — contractor reviewing a pending item */}
      {approvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setApprovalModal(null); setApprovalComment('') }} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">Review Item</p>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{approvalModal.description}</p>
              </div>
              <button onClick={() => { setApprovalModal(null); setApprovalComment('') }} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="flex flex-wrap gap-2 mb-4 text-xs text-slate-500">
                <span className="bg-slate-100 px-2 py-1 rounded-md">{approvalModal.room}</span>
                <span className="bg-slate-100 px-2 py-1 rounded-md">#{approvalModal.rowNum}</span>
                {approvalModal.activity && <span className="bg-slate-100 px-2 py-1 rounded-md">{approvalModal.activity}</span>}
                {approvalModal.coverage && <span className="bg-violet-50 text-violet-600 px-2 py-1 rounded-md">{approvalModal.coverage}</span>}
                {approvalModal.rcv > 0 && <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md font-semibold">{approvalModal.rcv.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
              </div>
              {approvalModal.comment && (
                <p className="text-xs text-slate-500 italic mb-3 bg-blue-50 px-3 py-2 rounded-lg">"{approvalModal.comment}"</p>
              )}
              <label className="text-xs text-slate-500 font-medium mb-1.5 block">Comment (optional)</label>
              <textarea
                value={approvalComment}
                onChange={e => setApprovalComment(e.target.value)}
                placeholder="Add a note about this decision…"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                rows={2}
              />
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => { returnItem(projectId, approvalModal.id, approvalComment, currentUserName); setApprovalModal(null); setApprovalComment('') }}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
              >
                Return
              </button>
              <button
                onClick={() => { approveItem(projectId, approvalModal.id, approvalComment, currentUserName); setApprovalModal(null); setApprovalComment('') }}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit for approval confirmation */}
      {submitConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSubmitConfirmItem(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-5">
              <p className="text-base font-semibold text-slate-800 mb-1">Submit for approval?</p>
              <p className="text-sm text-slate-500 line-clamp-2">{submitConfirmItem.description}</p>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setSubmitConfirmItem(null)}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setPendingApproval(projectId, submitConfirmItem.id, true)
                  setSubmitConfirmItem(null)
                }}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub picker bottom sheet */}
      {subPickerItemId && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setSubPickerItemId(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">Assign Subcontractor</span>
              <button onClick={() => setSubPickerItemId(null)} className="p-1 text-slate-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-4 py-2">
              <button
                onClick={() => { assignSubcontractor(projectId, [subPickerItemId], null); setSubPickerItemId(null) }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <span className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                None
              </button>
              {subcontractors.map(s => (
                <button
                  key={s.id}
                  onClick={() => { assignSubcontractor(projectId, [subPickerItemId], s.id); setSubPickerItemId(null) }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  style={{ color: s.color }}
                >
                  <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk select action bar — approve (contractors) or request approval (subs) */}
      {bulkSelectMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2 px-4 py-3 bg-white border-t border-slate-200 shadow-lg"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom) + 60px)' }}
        >
          <span className="text-xs font-semibold text-slate-600 flex-shrink-0">{selectedIds.size} selected</span>
          <div className="flex-1" />
          {isSubUser ? (
            <button
              onClick={() => {
                const ids = [...selectedIds].filter(id => {
                  const item = dataItems.find(i => i.id === id)
                  return item && !item.completed && (!item.pendingApproval || item.returned)
                })
                if (ids.length) bulkSetPending(projectId, ids)
                setSelectedIds(new Set())
                setBulkSelectMode(false)
              }}
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg flex-shrink-0"
            >
              Request Approval ({[...selectedIds].filter(id => {
                const item = dataItems.find(i => i.id === id)
                return item && !item.completed && (!item.pendingApproval || item.returned)
              }).length})
            </button>
          ) : (() => {
            const pendingIds = [...selectedIds].filter(id => dataItems.find(i => i.id === id)?.pendingApproval)
            return pendingIds.length > 0 ? (
              <button
                onClick={() => {
                  bulkApproveItems(projectId, pendingIds, currentUserName)
                  setSelectedIds(new Set())
                  setBulkSelectMode(false)
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg flex-shrink-0"
              >
                Approve ({pendingIds.length})
              </button>
            ) : (
              <span className="text-xs text-slate-400 flex-shrink-0">No pending items selected</span>
            )
          })()}
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkSelectMode(false) }}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg flex-shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {!isSubUser && assignMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-2 px-4 py-3 bg-white border-t border-slate-200 shadow-lg"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom) + 60px)' }}
        >
          <span className="text-xs font-semibold text-slate-600 flex-shrink-0">{selectedIds.size} selected</span>
          <select
            value={bulkSubId}
            onChange={e => setBulkSubId(e.target.value)}
            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
          >
            <option value="">— Assign sub —</option>
            {subcontractors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            onClick={handleBulkAssign}
            disabled={!bulkSubId}
            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-40 flex-shrink-0"
          >
            Assign
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkSubId('') }}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg flex-shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Comment bottom sheet */}
      {commentModalItemId && (() => {
        const item = dataItems.find(i => i.id === commentModalItemId)
        const notes = item?.commentNotes ?? []
        return (
          <div className="fixed inset-0 z-50 flex items-end pb-[calc(60px+env(safe-area-inset-bottom))]">
            <div className="absolute inset-0 bg-black/40" onClick={() => { setCommentModalItemId(null); setCommentDraft(''); setCommentDeleteConfirm(null) }} />
            <div className="relative bg-white rounded-t-2xl shadow-xl w-full flex flex-col max-h-[80dvh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
                  {item && <p className="text-xs text-slate-400 mt-0.5 truncate">#{item.rowNum} · {item.description}</p>}
                </div>
                <button onClick={() => { setCommentModalItemId(null); setCommentDraft(''); setCommentDeleteConfirm(null) }} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="p-5 flex flex-col gap-4">
                {/* Previous notes */}
                {notes.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-slate-500">Previous notes</p>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                      {notes.map((n, i) => (
                        <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
                          {commentDeleteConfirm === i ? (
                            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                              <p className="text-xs text-slate-700">Delete this note?</p>
                              <div className="flex gap-1.5 flex-shrink-0">
                                <button onClick={() => setCommentDeleteConfirm(null)} className="px-2.5 py-1 text-[11px] border border-slate-200 rounded text-slate-600">Cancel</button>
                                <button onClick={() => { deleteCommentNote(projectId, commentModalItemId, i); setCommentDeleteConfirm(null) }} className="px-2.5 py-1 text-[11px] bg-red-600 text-white rounded font-medium">Delete</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                {n.type && (
                                  <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mb-1 ${
                                    n.type === 'approval' ? 'bg-green-100 text-green-700' :
                                    n.type === 'return' ? 'bg-red-100 text-red-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {n.type === 'approval' ? 'Approved' : n.type === 'return' ? 'Returned' : 'Comment'}
                                  </span>
                                )}
                                <p className="text-xs text-slate-700 leading-snug break-words">{n.text}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {n.by && <span className="font-medium text-slate-500">{n.by} · </span>}
                                  {new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                                </p>
                              </div>
                              <button onClick={() => setCommentDeleteConfirm(i)} className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors mt-0.5 p-1" title="Delete note">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New note */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">New note</label>
                  <textarea
                    rows={3}
                    placeholder="Write a comment or note about this line item…"
                    value={commentDraft}
                    onChange={e => setCommentDraft(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    autoFocus
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setCommentModalItemId(null); setCommentDraft(''); setCommentDeleteConfirm(null) }}
                    className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      if (!commentDraft.trim()) return
                      addCommentNote(projectId, commentModalItemId, { text: commentDraft.trim(), createdAt: new Date().toISOString(), by: currentUserName })
                      setCommentDraft('')
                    }}
                    disabled={!commentDraft.trim()}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add Note
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
