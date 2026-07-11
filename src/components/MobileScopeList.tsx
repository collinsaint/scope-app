import { useState, useRef, useEffect } from 'react'
import type { ScopeItem, Subcontractor } from '../types'
import { useStore } from '../store/useStore'
import { uploadPhotoToOneDrive } from '../lib/oneDrive'
import { CameraCapture } from './CameraCapture'
import { translateTexts } from '../lib/translate'

interface Props {
  projectId: string
  items: ScopeItem[]
  subcontractors: Subcontractor[]
  roomFilter: string
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
  exterior: 'Exterior', interior: 'Interior', roof: 'Techo',
  storage: 'Almacenamiento', utility_room: 'Cuarto de Servicio',
  sunroom: 'Solario', mudroom: 'Entrada de Servicio',
  staircase: 'Escalera', stairs: 'Escalera',
}

function roomLabel(r: string, spanish = false) {
  if (spanish) {
    const key = r.toLowerCase()
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

export function MobileScopeList({ projectId, items, roomFilter }: Props) {
  const { toggleItem, addPhoto, removePhoto, addRoomPhoto, removeRoomPhoto, oneDrive, bulkComplete, bulkUncomplete, addCommentNote, deleteCommentNote, projects, setTranslationCache } = useStore()
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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const roomGalleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showSearch) {
      setSearchDraft(search)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [showSearch])

  useEffect(() => {
    if (!spanishMode) return
    const allDescriptions = items.filter(i => !i.isHeader && i.description).map(i => i.description)
    const missing = [...new Set(allDescriptions)].filter(d => !(d in translationCache))
    if (missing.length === 0) return
    setTranslating(true)
    translateTexts(missing).then(translated => {
      const patch: Record<string, string> = {}
      missing.forEach((d, i) => { patch[d] = translated[i] })
      setTranslationCache(projectId, patch)
    }).finally(() => setTranslating(false))
  }, [spanishMode, projectId])

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

  const progressItems = coverageFilter !== 'all'
    ? dataItems.filter(i => i.coverage === coverageFilter)
    : dataItems
  const completedCount = progressItems.filter(i => i.completed).length
  const pct = progressItems.length ? Math.round(completedCount / progressItems.length * 100) : 0

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
        if (oneDrive.connected) {
          const fileName = `${photoModalItemId}_${Date.now()}.jpg`
          uploadPhotoToOneDrive(oneDrive.rootFolderName, project.name, data, fileName).catch(() => {})
        }
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
        if (oneDrive.connected) {
          const fileName = `room_${roomPhotoModal}_${Date.now()}.jpg`
          uploadPhotoToOneDrive(oneDrive.rootFolderName, project.name, data, fileName).catch(() => {})
        }
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
          if (oneDrive.connected) {
            const fileName = `${photoModalItemId}_${Date.now()}.jpg`
            uploadPhotoToOneDrive(oneDrive.rootFolderName, project.name, stamped, fileName).catch(() => {})
          }
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
          if (oneDrive.connected) {
            const fileName = `room_${roomPhotoModal}_${Date.now()}.jpg`
            uploadPhotoToOneDrive(oneDrive.rootFolderName, project.name, stamped, fileName).catch(() => {})
          }
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
            {groupedByRoom.map(group => {
              const roomPhotoCount = (project?.roomPhotos?.[group.room]?.length ?? 0)
                + group.roomItems.reduce((acc, i) => acc + i.photos.length, 0)
              return (
                <div key={group.room}>
                  {/* Sticky room header */}
                  {(() => {
                    const allDone = group.roomItems.length > 0 && group.roomItems.every(i => i.completed)
                    return (
                      <div
                        className="sticky top-0 z-10 px-4 py-2 border-b flex items-center gap-2 transition-colors"
                        style={
                          allDone
                            ? { background: '#dcfce7', borderColor: '#bbf7d0' }
                            : { background: '#EEEDFE', borderColor: '#CECBF6' }
                        }
                      >
                        <span
                          className="text-[11px] font-bold uppercase tracking-widest flex-1 min-w-0 truncate"
                          style={{ color: allDone ? '#15803d' : '#3C3489' }}
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

                        {allDone ? (
                          <button
                            onClick={() => {
                              const ids = group.roomItems.map(i => i.id)
                              bulkUncomplete(projectId, ids)
                              setBulkCompletedRooms(prev => {
                                const next = new Set(prev)
                                next.delete(group.room)
                                return next
                              })
                            }}
                            className="text-[10px] font-medium px-2 py-1 rounded-md border transition-colors flex-shrink-0 whitespace-nowrap"
                            style={{ color: '#15803d', borderColor: '#86efac', background: '#f0fdf4' }}
                          >
                            Undo All
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const ids = group.roomItems.filter(i => !i.completed).map(i => i.id)
                              if (ids.length) {
                                bulkComplete(projectId, ids)
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
                                {spanishMode ? (translationCache[item.description] ?? item.description) : item.description}
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

                            {/* Action buttons column — order: Note → Comment → Photo, then # below */}
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <div className="flex items-center gap-1">
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
                              {/* # below photo button */}
                              <span className="text-[11px] text-slate-400 leading-none">#{item.rowNum}</span>
                            </div>
                          </div>
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
                                <p className="text-xs text-slate-700 leading-snug break-words">{n.text}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</p>
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
                      addCommentNote(projectId, commentModalItemId, { text: commentDraft.trim(), createdAt: new Date().toISOString() })
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
