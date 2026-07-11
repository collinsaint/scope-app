import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ScopeItem, Walk, WalkNote, WalkGroupNote, WalkRoomPhoto, WalkGeneralNote, WalkItemOverride } from '../types'
import { useStore } from '../store/useStore'
import { buildWalkReportPdfBlob, openWalkReportPdf } from '../lib/exportReport'
import { downloadWalkPhotos, buildPhotosZipBlob, downloadSelectedPhotos } from '../lib/downloadPhotos'
import { uploadPhotoToOneDrive } from '../lib/oneDrive'
import { useViewMode } from '../hooks/useViewMode'
import { CameraCapture } from './CameraCapture'

const WALK_COL_COUNT = 7

type RenderRow = ScopeItem | { _roomHeader: true; room: string; id: string } | { _groupNote: true; note: WalkGroupNote; id: string }

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

function buildRenderRows(
  items: ScopeItem[],
  roomFilter: string,
  groupNotes: WalkGroupNote[],
  customRooms: string[] = [],
): RenderRow[] {
  if (roomFilter !== 'all') {
    const result: RenderRow[] = [...items]
    for (const note of groupNotes.filter(n => n.room === roomFilter)) {
      result.push({ _groupNote: true, note, id: note.id })
    }
    return result
  }
  const result: RenderRow[] = []
  let currentRoom: string | null = null
  const rowsWithHeaders: RenderRow[] = []
  let lastRoom: string | null = null
  const seenRooms = new Set<string>()
  for (const item of items) {
    if (!item.isHeader && item.room !== lastRoom) {
      rowsWithHeaders.push({ _roomHeader: true, room: item.room, id: `__room_${item.room}` })
      seenRooms.add(item.room)
      lastRoom = item.room
    }
    rowsWithHeaders.push(item)
  }
  for (const row of rowsWithHeaders) {
    if ('_roomHeader' in row) {
      if (currentRoom) {
        for (const note of groupNotes.filter(n => n.room === currentRoom)) {
          result.push({ _groupNote: true, note, id: note.id })
        }
      }
      currentRoom = row.room
    }
    result.push(row)
  }
  if (currentRoom) {
    for (const note of groupNotes.filter(n => n.room === currentRoom)) {
      result.push({ _groupNote: true, note, id: note.id })
    }
  }
  // Append custom rooms that have no scope items
  for (const cr of customRooms) {
    if (!seenRooms.has(cr)) {
      result.push({ _roomHeader: true, room: cr, id: `__room_${cr}` })
      for (const note of groupNotes.filter(n => n.room === cr)) {
        result.push({ _groupNote: true, note, id: note.id })
      }
    }
  }
  return result
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function activityLabel(a: string): string {
  const map: Record<string, string> = { 'Remove and Replace': 'R&R', 'Remove': 'Remove', 'Replace': 'Replace' }
  return map[a] ?? a
}

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

function formatNoteDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function useKeyboardHeight(): number {
  const [kh, setKh] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setKh(Math.max(0, window.innerHeight - vv.height))
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])
  return kh
}

interface MobileWalkCardProps {
  item: ScopeItem
  override: WalkItemOverride | undefined
  isRemoved: boolean
  hasQty: boolean
  hasNotes: boolean
  notes: WalkNote[]
  onRemove: () => void
  onQty: () => void
  onRevertQty: () => void
  onNote: () => void
  onDeleteNote: (idx: number) => void
  onShowNote?: () => void
}

function MobileWalkCard({ item, override, isRemoved, hasQty, hasNotes, notes, onRemove, onQty, onRevertQty, onNote, onDeleteNote, onShowNote }: MobileWalkCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [deleteNoteConfirm, setDeleteNoteConfirm] = useState<number | null>(null)

  return (
    <div className={`border-b border-slate-100 ${isRemoved ? 'bg-red-50/50' : hasQty || hasNotes ? 'bg-amber-50/30' : 'bg-white'}`}>
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {(isRemoved || hasQty || hasNotes) && (
              <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${isRemoved ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {isRemoved ? 'Removed' : 'Modified'}
              </span>
            )}
            <p className={`text-xs font-medium leading-snug ${isRemoved ? 'line-through text-slate-400' : 'text-slate-800'}`}>
              {item.description}
            </p>
          </div>
          <span className="text-[11px] text-slate-400 flex-shrink-0">#{item.rowNum}</span>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-2">
          {item.activity && <span className="text-[11px] text-slate-400">{activityLabel(item.activity)}</span>}
          <span className="text-[11px] text-slate-400">
            {item.qty > 0 ? `${parseFloat(item.qty.toFixed(2))} ${item.unit}` : '—'}
            {hasQty && <span className="text-amber-600 font-semibold ml-1">→ {parseFloat((override!.qty as number).toFixed(2))} {item.unit}</span>}
          </span>
          {item.rcv > 0 && <span className="text-[11px] font-semibold text-slate-600">{fmt(item.rcv)}</span>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onRemove}
            className={`px-2.5 py-1.5 text-[11px] font-medium border rounded-lg transition-colors ${
              isRemoved
                ? 'border-blue-300 text-blue-700 bg-blue-50'
                : 'border-red-200 text-red-600 bg-red-50'
            }`}
          >
            {isRemoved ? 'Undo Remove' : 'Remove'}
          </button>
          <button
            onClick={onQty}
            disabled={isRemoved}
            className="px-2.5 py-1.5 text-[11px] font-medium border border-slate-200 text-slate-600 rounded-lg disabled:opacity-40"
          >
            {hasQty ? 'Edit Qty' : 'Update Qty'}
          </button>
          {hasQty && (
            <button
              onClick={onRevertQty}
              className="px-2.5 py-1.5 text-[11px] font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg"
            >
              Revert Qty
            </button>
          )}
          <button
            onClick={onNote}
            className={`px-2.5 py-1.5 text-[11px] font-medium border rounded-lg transition-colors ${
              hasNotes ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-slate-200 text-slate-600'
            }`}
          >
            Notes{hasNotes ? ` (${notes.length})` : ''}
          </button>
          {item.note && (
            <button
              onClick={onShowNote}
              className="px-2 py-1.5 border border-blue-200 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center"
              title="View Inspection Notes"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
          {hasNotes && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="ml-auto text-slate-400 p-1"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded notes */}
      {expanded && hasNotes && (
        <div className="px-4 pb-3 pt-1 bg-blue-50/50 border-t border-blue-100 space-y-2">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Inspection Notes</p>
          {notes.map((note, idx) => (
            <div key={idx} className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 leading-relaxed">{note.text}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{formatNoteDate(note.createdAt)}</p>
              </div>
              {deleteNoteConfirm === idx ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setDeleteNoteConfirm(null)} className="px-1.5 py-0.5 text-[10px] border border-slate-200 rounded text-slate-500">Cancel</button>
                  <button onClick={() => { onDeleteNote(idx); setDeleteNoteConfirm(null) }} className="px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded">Delete</button>
                </div>
              ) : (
                <button onClick={() => setDeleteNoteConfirm(idx)} className="text-slate-300 hover:text-red-400 flex-shrink-0 p-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  projectId: string
  walk: Walk
  items: ScopeItem[]
  roomFilter: string
  onRoomDeleted?: () => void
  onAddRoom?: () => void
}

export function WalkView({ projectId, walk, items, roomFilter, onRoomDeleted, onAddRoom }: Props) {
  const { updateWalkItem, addWalkGroupNote, deleteWalkGroupNote, addWalkRoomPhoto, deleteWalkRoomPhoto, bulkDeleteWalkRoomPhotos, updateWalkRoomPhoto, addWalkGeneralNote, deleteWalkGeneralNote, deleteWalkCustomRoom, addWalkCustomRoom, projects, oneDrive, walkPresets } = useStore()
  const { isMobile } = useViewMode()
  const project = projects.find(p => p.id === projectId)
  const spanishMode = project?.spanishMode ?? false
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [qtyPrompt, setQtyPrompt] = useState<{ itemId: string; value: string } | null>(null)
  const [notePrompt, setNotePrompt] = useState<{ itemId: string; value: string } | null>(null)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)
  const [groupNotePrompt, setGroupNotePrompt] = useState<{ room: string; text: string; qty: string } | null>(null)
  const [groupNoteDeleteConfirm, setGroupNoteDeleteConfirm] = useState<string | null>(null)
  const [generalNotePrompt, setGeneralNotePrompt] = useState<{ text: string; qty: string } | null>(null)
  const [generalNoteDeleteConfirm, setGeneralNoteDeleteConfirm] = useState<string | null>(null)
  const [removeRoomConfirm, setRemoveRoomConfirm] = useState(false)
  useEffect(() => { setRemoveRoomConfirm(false) }, [roomFilter])
  const [photoModal, setPhotoModal] = useState<{ room: string } | null>(null)
  const [photoDeleteConfirm, setPhotoDeleteConfirm] = useState<string | null>(null)
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [allPhotoDeleteConfirm, setAllPhotoDeleteConfirm] = useState<string | null>(null)
  const [activePhotoRoom, setActivePhotoRoom] = useState<string>('_general_')
  const [expandedPhoto, setExpandedPhoto] = useState<{ photos: WalkRoomPhoto[]; index: number } | null>(null)
  const gallerySwipeX = useRef<number | null>(null)

  // Keyboard navigation for gallery — must be after expandedPhoto declaration
  useEffect(() => {
    if (!expandedPhoto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') setExpandedPhoto(p => p && p.index > 0 ? { ...p, index: p.index - 1 } : p)
      else if (e.key === 'ArrowRight') setExpandedPhoto(p => p && p.index < p.photos.length - 1 ? { ...p, index: p.index + 1 } : p)
      else if (e.key === 'Escape') setExpandedPhoto(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandedPhoto])
  const [showCamera, setShowCamera] = useState(false)
  const [photoUploadProgress, setPhotoUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [bulkActive, setBulkActive] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMoveTarget, setBulkMoveTarget] = useState('')
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [roomHeaderDeleteConfirm, setRoomHeaderDeleteConfirm] = useState<string | null>(null)
  const [pendingPhotoAction, setPendingPhotoAction] = useState<'camera' | 'gallery' | null>(null)
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [exportIncludePhotos, setExportIncludePhotos] = useState(true)
  const [exportAdjustedOnly, setExportAdjustedOnly] = useState(false)
  const [sendType, setSendType] = useState<'report' | 'photos' | 'both'>('both')
  const [showItemNote, setShowItemNote] = useState<{ id: string; note: string } | null>(null)
  const keyboardHeight = useKeyboardHeight()
  const [sharePdfBlob, setSharePdfBlob] = useState<Blob | null>(null)
  const [shareZipBlob, setShareZipBlob] = useState<Blob | null>(null)
  const [sharePrepping, setSharePrepping] = useState(false)
  const [photoRoomPickerRoom, setPhotoRoomPickerRoom] = useState('_general_')
  const [newRoomInPicker, setNewRoomInPicker] = useState('')
  const [addingRoomInPicker, setAddingRoomInPicker] = useState(false)
  const galleryRef = useRef<HTMLInputElement>(null)

  function getOverride(itemId: string) {
    return (walk.itemOverrides ?? []).find(o => o.itemId === itemId)
  }

  function handleRemove(itemId: string) {
    const override = getOverride(itemId)
    updateWalkItem(projectId, walk.id, itemId, { removed: !override?.removed })
  }

  // Pre-compute share blobs whenever the send type changes so handleSend is synchronous
  // (avoids losing the iOS user-gesture context across async awaits before navigator.share)
  useEffect(() => {
    if (!showExportOptions || !project) return
    setSharePdfBlob(null)
    setShareZipBlob(null)
    setSharePrepping(true)

    const tasks: Promise<void>[] = []

    if (sendType === 'report' || sendType === 'both') {
      tasks.push(
        Promise.resolve(buildWalkReportPdfBlob(project, walk, items, { adjustedOnly: exportAdjustedOnly }))
          .then(setSharePdfBlob),
      )
    }

    if ((sendType === 'photos' || sendType === 'both') && (walk.roomPhotos?.length ?? 0) > 0) {
      tasks.push(
        buildPhotosZipBlob(walk).then(b => { if (b) setShareZipBlob(b) }),
      )
    }

    Promise.all(tasks).finally(() => setSharePrepping(false))
  }, [showExportOptions, sendType, exportAdjustedOnly])

  function handleSend() {
    if (!project) return
    const files: File[] = []
    const slug = walk.name.replace(/\s+/g, '-')

    if ((sendType === 'report' || sendType === 'both') && sharePdfBlob) {
      files.push(new File([sharePdfBlob], `walk-report-${slug}.pdf`, { type: 'application/pdf' }))
    }
    if ((sendType === 'photos' || sendType === 'both') && shareZipBlob) {
      files.push(new File([shareZipBlob], `walk-photos-${slug}.zip`, { type: 'application/zip' }))
    }

    if (files.length === 0) return

    function downloadAll(f: File[]) {
      for (const file of f) {
        const url = URL.createObjectURL(file)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      }
    }

    const canShare = 'share' in navigator && navigator.canShare?.({ files })
    if (canShare) {
      navigator.share({ files, title: `Walk Report — ${walk.name}` })
        .then(() => setShowExportOptions(false))
        .catch(err => {
          if ((err as Error).name !== 'AbortError') downloadAll(files)
        })
    } else {
      downloadAll(files)
      setShowExportOptions(false)
    }
  }

  function openQtyPrompt(itemId: string) {
    setQtyPrompt({ itemId, value: '' })
  }

  function saveQty() {
    if (!qtyPrompt) return
    const parsed = parseFloat(qtyPrompt.value)
    if (!isNaN(parsed) && parsed >= 0) {
      updateWalkItem(projectId, walk.id, qtyPrompt.itemId, { qty: parsed })
    }
    setQtyPrompt(null)
  }

  function openNotePrompt(itemId: string) {
    setConfirmDeleteIdx(null)
    setNotePrompt({ itemId, value: '' })
  }

  function saveNote() {
    if (!notePrompt || !notePrompt.value.trim()) { setNotePrompt(null); return }
    const existing = getOverride(notePrompt.itemId)?.notes ?? []
    const newNote: WalkNote = { text: notePrompt.value.trim(), createdAt: new Date().toISOString() }
    updateWalkItem(projectId, walk.id, notePrompt.itemId, { notes: [...existing, newNote] })
    setNotePrompt(p => p ? { ...p, value: '' } : null)
  }

  function openGroupNotePrompt(room: string) {
    setGroupNoteDeleteConfirm(null)
    setGroupNotePrompt({ room, text: '', qty: '' })
  }

  function saveGroupNote() {
    if (!groupNotePrompt || !groupNotePrompt.text.trim()) { setGroupNotePrompt(null); return }
    const parsedQty = groupNotePrompt.qty.trim() ? parseFloat(groupNotePrompt.qty) : undefined
    const note: WalkGroupNote = {
      id: crypto.randomUUID(),
      room: groupNotePrompt.room,
      text: groupNotePrompt.text.trim(),
      qty: !isNaN(parsedQty!) ? parsedQty : undefined,
      createdAt: new Date().toISOString(),
    }
    addWalkGroupNote(projectId, walk.id, note)
    setGroupNotePrompt(p => p ? { ...p, text: '', qty: '' } : null)
  }

  function saveGeneralNote() {
    if (!generalNotePrompt || !generalNotePrompt.text.trim()) { setGeneralNotePrompt(null); return }
    const parsedQty = generalNotePrompt.qty.trim() ? parseFloat(generalNotePrompt.qty) : undefined
    const note: WalkGeneralNote = {
      id: crypto.randomUUID(),
      text: generalNotePrompt.text.trim(),
      qty: !isNaN(parsedQty!) ? parsedQty : undefined,
      createdAt: new Date().toISOString(),
    }
    addWalkGeneralNote(projectId, walk.id, note)
    setGeneralNotePrompt(p => p ? { ...p, text: '', qty: '' } : null)
  }

  function openPhotoModal(room: string) {
    setPhotoDeleteConfirm(null)
    setActivePhotoRoom(room)
    setPhotoModal({ room })
    setBulkActive(false)
    setBulkSelectedIds(new Set())
    setBulkMoveTarget('')
  }

  function openAllPhotos() {
    setAllPhotoDeleteConfirm(null)
    setActivePhotoRoom('_general_')
    setShowAllPhotos(true)
    setBulkActive(false)
    setBulkSelectedIds(new Set())
    setBulkMoveTarget('')
  }

  function toggleBulkSelect(id: string) {
    setBulkSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function bulkMovePhotos() {
    if (!bulkMoveTarget || bulkSelectedIds.size === 0) return
    for (const id of bulkSelectedIds) {
      updateWalkRoomPhoto(projectId, walk.id, id, { room: bulkMoveTarget })
    }
    setBulkSelectedIds(new Set())
    setBulkMoveTarget('')
  }

  function bulkDeleteSelected() {
    setBulkDeleteConfirm(true)
  }

  function confirmBulkDelete() {
    bulkDeleteWalkRoomPhotos(projectId, walk.id, [...bulkSelectedIds])
    setBulkSelectedIds(new Set())
    setBulkActive(false)
    setBulkDeleteConfirm(false)
  }

  function openGeneralPhotoAction(action: 'camera' | 'gallery') {
    setPhotoRoomPickerRoom('_general_')
    setNewRoomInPicker('')
    setAddingRoomInPicker(false)
    setPendingPhotoAction(action)
  }

  function confirmPhotoRoomPick() {
    const room = photoRoomPickerRoom
    setPendingPhotoAction(null)
    setActivePhotoRoom(room)
    if (pendingPhotoAction === 'camera') {
      setShowCamera(true)
    } else {
      galleryRef.current?.click()
    }
  }

  function addRoomFromPicker() {
    const name = newRoomInPicker.trim()
    if (!name) return
    addWalkCustomRoom(projectId, walk.id, name)
    setPhotoRoomPickerRoom(name)
    setNewRoomInPicker('')
    setAddingRoomInPicker(false)
  }

  async function handlePhotoFiles(files: FileList | null, room: string) {
    if (!files || !project) return
    for (const file of Array.from(files)) {
      try {
        const data = await stampPhoto(file, project.name)
        const photo: WalkRoomPhoto = { id: crypto.randomUUID(), room, data, createdAt: new Date().toISOString() }
        addWalkRoomPhoto(projectId, walk.id, photo)

        // Fire-and-forget OneDrive sync
        if (oneDrive.connected && project) {
          const fileName = `walk_${room}_${photo.id}.jpg`
          uploadPhotoToOneDrive(oneDrive.rootFolderName, project.name, data, fileName).catch(() => {})
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  function deleteNote(itemId: string, idx: number) {
    const existing = getOverride(itemId)?.notes ?? []
    updateWalkItem(projectId, walk.id, itemId, { notes: existing.filter((_, i) => i !== idx) })
    setConfirmDeleteIdx(null)
  }

  const filtered = items.filter(item => {
    if (item.isHeader) return true
    if (roomFilter !== 'all' && item.room !== roomFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        item.description.toLowerCase().includes(q) ||
        item.activity.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q)
      )
    }
    return true
  })

  const pruned = filtered.filter((item, idx) => {
    if (!item.isHeader) return true
    const next = filtered[idx + 1]
    return next && !next.isHeader
  })

  const groupNotes = walk.groupNotes ?? []
  const roomPhotos = walk.roomPhotos ?? []
  const generalNotes = walk.generalNotes ?? []
  const customRooms = walk.customRooms ?? []
  const isCustomRoom = roomFilter !== 'all' && customRooms.includes(roomFilter)
  const availableRooms = [...new Set([...items.filter(i => !i.isHeader).map(i => i.room), ...customRooms, '_general_'])]
  const renderRows = buildRenderRows(pruned, roomFilter, groupNotes, customRooms)
  const qtyItem = qtyPrompt ? items.find(i => i.id === qtyPrompt.itemId) : null
  const noteItem = notePrompt ? items.find(i => i.id === notePrompt.itemId) : null
  const noteItemOverride = notePrompt ? getOverride(notePrompt.itemId) : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Mobile Toolbar */}
      {isMobile && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white flex-shrink-0">
          <button
            onClick={() => setShowSearch(true)}
            className={`p-2 rounded-lg border transition-colors ${search ? 'border-blue-400 text-blue-600 bg-blue-50' : 'border-slate-200 text-slate-500'}`}
            title="Search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <div className="flex items-center gap-2 ml-auto">
            {onAddRoom && (
              <button
                onClick={onAddRoom}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-dashed border-slate-300 text-slate-500 rounded-lg hover:border-violet-400 hover:text-violet-600 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Room
              </button>
            )}
            <button
              onClick={openAllPhotos}
              className={`p-2 rounded-lg border transition-colors ${roomPhotos.length > 0 ? 'border-violet-300 text-violet-600 bg-violet-50' : 'border-slate-200 text-slate-500'}`}
              title="Walk Photos"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <button
              onClick={() => setGeneralNotePrompt({ text: '', qty: '' })}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${generalNotes.length > 0 ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-slate-200 text-slate-600'}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              General Notes{generalNotes.length > 0 ? ` (${generalNotes.length})` : ''}
            </button>
            <button
              onClick={() => setShowExportOptions(true)}
              className="p-2 bg-blue-600 text-white rounded-lg"
              title="Export Report"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Mobile search popup */}
      {isMobile && showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white border-b border-slate-200 px-3 py-3 flex items-center gap-2">
            <svg className="text-slate-400 flex-shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm border-none outline-none bg-transparent"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
            <button onClick={() => setShowSearch(false)} className="text-sm font-medium text-blue-600 px-1">Done</button>
          </div>
          <div className="flex-1" onClick={() => setShowSearch(false)} />
        </div>
      )}

      {/* Desktop Toolbar */}
      {!isMobile && (
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white flex-shrink-0">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-400">{walk.name}</span>
            {roomFilter !== 'all' && (() => {
              const cnt = roomPhotos.filter(p => p.room === roomFilter).length
              return (
                <>
                  <button
                    onClick={() => openPhotoModal(roomFilter)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${cnt > 0 ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                    </svg>
                    Photos{cnt > 0 ? ` (${cnt})` : ''}
                  </button>
                  <button
                    onClick={() => openGroupNotePrompt(roomFilter)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-teal-300 text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Group Note
                  </button>
                </>
              )
            })()}
            {roomPhotos.length > 0 && (
              <button
                onClick={() => project && downloadWalkPhotos(walk, project.name)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-violet-300 text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download Photos ({roomPhotos.length})
              </button>
            )}
            {isCustomRoom && (
              removeRoomConfirm ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                  <span className="text-xs text-red-700 font-medium whitespace-nowrap">Remove "{roomLabel(roomFilter, spanishMode)}"?</span>
                  <button onClick={() => setRemoveRoomConfirm(false)} className="px-2 py-0.5 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors">Cancel</button>
                  <button
                    onClick={() => { deleteWalkCustomRoom(projectId, walk.id, roomFilter); setRemoveRoomConfirm(false); onRoomDeleted?.() }}
                    className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
                  >Remove</button>
                </div>
              ) : (
                <button onClick={() => setRemoveRoomConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                  Remove Room
                </button>
              )
            )}
            <button
              onClick={openAllPhotos}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${roomPhotos.length > 0 ? 'border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
              </svg>
              Photos{roomPhotos.length > 0 ? ` (${roomPhotos.length})` : ''}
            </button>
            <button
              onClick={() => setGeneralNotePrompt({ text: '', qty: '' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${generalNotes.length > 0 ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              General Note{generalNotes.length > 0 ? `s (${generalNotes.length})` : '(s)'}
            </button>
            <button
              onClick={() => setShowExportOptions(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export Report
            </button>
          </div>
        </div>
      )}

      {/* Mobile card list */}
      {isMobile && (
        <div className="flex-1 overflow-y-auto">
          {/* Sticky header for specific room filter — shows Photos + Group Note buttons */}
          {roomFilter !== 'all' && (() => {
            const photoCnt = roomPhotos.filter(p => p.room === roomFilter).length
            return (
              <div className="sticky top-0 z-10 px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex-1 min-w-0 truncate">{roomLabel(roomFilter, spanishMode)}</span>
                <button
                  onClick={() => openPhotoModal(roomFilter)}
                  className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium border rounded-md transition-colors ${photoCnt > 0 ? 'border-violet-300 text-violet-700 bg-violet-50' : 'border-slate-300 text-slate-500 bg-white'}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                  </svg>
                  Photos{photoCnt > 0 ? ` (${photoCnt})` : ''}
                </button>
                <button
                  onClick={() => openGroupNotePrompt(roomFilter)}
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium border border-teal-300 text-teal-700 bg-teal-50 rounded-md"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Group Note
                </button>
                {isCustomRoom && (
                  roomHeaderDeleteConfirm === roomFilter ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setRoomHeaderDeleteConfirm(null)} className="px-1.5 py-1 text-[10px] border border-slate-300 rounded bg-white text-slate-600">Cancel</button>
                      <button
                        onClick={() => { deleteWalkCustomRoom(projectId, walk.id, roomFilter); setRoomHeaderDeleteConfirm(null); onRoomDeleted?.() }}
                        className="px-1.5 py-1 text-[10px] bg-red-600 text-white rounded font-medium"
                      >Remove</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRoomHeaderDeleteConfirm(roomFilter)}
                      className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove room"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  )
                )}
              </div>
            )
          })()}
          {renderRows.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-400">No items match your search.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {renderRows.map(row => {
                if ('_roomHeader' in row) {
                  const photoCnt = roomPhotos.filter(p => p.room === row.room).length
                  const isRowCustom = customRooms.includes(row.room)
                  return (
                    <div key={row.id} className="sticky top-0 z-10 px-3 py-2 flex items-center gap-2" style={{ background: '#EEEDFE', borderBottom: '1px solid #CECBF6' }}>
                      <span className="text-[11px] font-bold uppercase tracking-wider flex-1 min-w-0 truncate" style={{ color: '#3C3489' }}>{roomLabel(row.room, spanishMode)}</span>
                      <button
                        onClick={() => openPhotoModal(row.room)}
                        className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium border rounded-md transition-colors ${
                          photoCnt > 0 ? 'border-violet-300 text-violet-700 bg-violet-50' : 'border-slate-300 text-slate-500 bg-white'
                        }`}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                        </svg>
                        Photos{photoCnt > 0 ? ` (${photoCnt})` : ''}
                      </button>
                      <button
                        onClick={() => openGroupNotePrompt(row.room)}
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium border border-teal-300 text-teal-700 bg-teal-50 rounded-md"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Group Note
                      </button>
                      {isRowCustom && (
                        roomHeaderDeleteConfirm === row.room ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => setRoomHeaderDeleteConfirm(null)} className="px-1.5 py-1 text-[10px] border border-slate-300 rounded bg-white text-slate-600">Cancel</button>
                            <button
                              onClick={() => { deleteWalkCustomRoom(projectId, walk.id, row.room); setRoomHeaderDeleteConfirm(null); onRoomDeleted?.() }}
                              className="px-1.5 py-1 text-[10px] bg-red-600 text-white rounded font-medium"
                            >Remove</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRoomHeaderDeleteConfirm(row.room)}
                            className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors"
                            title="Remove room"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        )
                      )}
                    </div>
                  )
                }
                if ('_groupNote' in row) {
                  const gn = row.note
                  return (
                    <div key={row.id} className="px-4 py-3 bg-teal-50 border-l-4 border-teal-400 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-0.5">Group Note</p>
                        <p className="text-sm text-slate-800 leading-snug">{gn.text}</p>
                        {gn.qty !== undefined && <p className="text-xs text-teal-700 font-medium mt-0.5">Qty: {gn.qty}</p>}
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatNoteDate(gn.createdAt)}</p>
                      </div>
                      {groupNoteDeleteConfirm === gn.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setGroupNoteDeleteConfirm(null)} className="px-2 py-1 text-[11px] border border-slate-200 rounded text-slate-600">Cancel</button>
                          <button onClick={() => { deleteWalkGroupNote(projectId, walk.id, gn.id); setGroupNoteDeleteConfirm(null) }} className="px-2 py-1 text-[11px] bg-red-600 text-white rounded font-medium">Delete</button>
                        </div>
                      ) : (
                        <button onClick={() => setGroupNoteDeleteConfirm(gn.id)} className="text-slate-300 hover:text-red-400 p-1">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                }
                // Regular scope item
                const item = row as ScopeItem
                if (item.isHeader) return null
                const isDrvMobile = item.coverage?.toUpperCase() === 'DRV'
                if (isDrvMobile) {
                  return (
                    <div key={item.id} className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 opacity-60">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 mt-0.5">DRV</span>
                        <p className="text-xs text-slate-400 line-through leading-snug flex-1 min-w-0">{item.description}</p>
                        <span className="text-[10px] text-slate-300 flex-shrink-0">#{item.rowNum}</span>
                      </div>
                      <div className="flex items-center gap-3 pl-7">
                        {item.activity && <span className="text-[11px] text-slate-400">{activityLabel(item.activity)}</span>}
                        {item.qty > 0 && <span className="text-[11px] text-slate-400">{Number(item.qty).toLocaleString('en-US', { maximumFractionDigits: 2 })} {item.unit}</span>}
                      </div>
                    </div>
                  )
                }
                const override = getOverride(item.id)
                const isRemoved = override?.removed === true
                const hasQty = override?.qty !== undefined
                const hasNotes = (override?.notes?.length ?? 0) > 0
                const notes = override?.notes ?? []
                return (
                  <MobileWalkCard
                    key={item.id}
                    item={item}
                    override={override}
                    isRemoved={isRemoved}
                    hasQty={hasQty}
                    hasNotes={hasNotes}
                    notes={notes}
                    onRemove={() => handleRemove(item.id)}
                    onQty={() => openQtyPrompt(item.id)}
                    onRevertQty={() => updateWalkItem(projectId, walk.id, item.id, { qty: undefined })}
                    onNote={() => openNotePrompt(item.id)}
                    onDeleteNote={(idx) => deleteNote(item.id, idx)}
                    onShowNote={item.note ? () => setShowItemNote({ id: item.id, note: item.note }) : undefined}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Desktop Table */}
      {!isMobile && (
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium text-slate-400 w-12">#</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Description</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Activity</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400 whitespace-nowrap">Qty / Unit</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Amount</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Note</th>
              <th className="px-3 py-3 text-left text-[11px] font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {renderRows.length === 0 ? (
              <tr>
                <td colSpan={WALK_COL_COUNT} className="px-4 py-16 text-center text-sm text-slate-400">
                  No items match your search.
                </td>
              </tr>
            ) : renderRows.map(row => {
              if ('_groupNote' in row) {
                const gn = row.note
                return (
                  <tr key={row.id} style={{ backgroundColor: '#F0FDF4' }} className="border-b border-teal-100">
                    <td className="px-4 py-3" style={{ borderLeft: '3px solid #6EE7B7' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </td>
                    <td className="px-3 py-3 max-w-[220px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide">Group Note</span>
                        <span className="text-[13px] text-slate-800">{gn.text}</span>
                        <span className="text-[10px] text-slate-400">{formatNoteDate(gn.createdAt)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-[13px] text-teal-700 font-medium whitespace-nowrap">
                      {gn.qty !== undefined ? `${gn.qty}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3">
                      {groupNoteDeleteConfirm === gn.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-600">Delete?</span>
                          <button onClick={() => setGroupNoteDeleteConfirm(null)} className="px-2 py-0.5 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors">No</button>
                          <button onClick={() => { deleteWalkGroupNote(projectId, walk.id, gn.id); setGroupNoteDeleteConfirm(null) }} className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors">Yes</button>
                        </div>
                      ) : (
                        <button onClick={() => setGroupNoteDeleteConfirm(gn.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete group note">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                )
              }
              if ('_roomHeader' in row) {
                const isHeaderCustom = customRooms.includes(row.room)
                return (
                  <tr key={row.id}>
                    <td colSpan={WALK_COL_COUNT} className="sticky top-10 z-[5] px-4 pt-5 pb-2 bg-white">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: '#3C3489' }}>
                          {roomLabel(row.room, spanishMode)}
                        </span>
                        <div className="flex-1 h-px" style={{ background: '#CECBF6' }} />
                        {(() => {
                          const cnt = roomPhotos.filter(p => p.room === row.room).length
                          return (
                            <button
                              onClick={() => openPhotoModal(row.room)}
                              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium border rounded hover:bg-violet-100 transition-colors whitespace-nowrap flex-shrink-0 ${cnt > 0 ? 'border-violet-300 text-violet-700 bg-violet-50' : 'border-slate-200 text-slate-500 bg-white'}`}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                              </svg>
                              Photos{cnt > 0 ? ` (${cnt})` : ''}
                            </button>
                          )
                        })()}
                        <button
                          onClick={() => openGroupNotePrompt(row.room)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium border border-teal-300 text-teal-700 bg-teal-50 rounded hover:bg-teal-100 transition-colors whitespace-nowrap flex-shrink-0"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          Add Group Note
                        </button>
                        {isHeaderCustom && (
                          roomHeaderDeleteConfirm === row.room ? (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button onClick={() => setRoomHeaderDeleteConfirm(null)} className="px-2 py-0.5 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors">Cancel</button>
                              <button
                                onClick={() => { deleteWalkCustomRoom(projectId, walk.id, row.room); setRoomHeaderDeleteConfirm(null); onRoomDeleted?.() }}
                                className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
                              >Remove</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setRoomHeaderDeleteConfirm(row.room)}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium border border-red-200 text-red-500 bg-red-50 rounded hover:bg-red-100 transition-colors whitespace-nowrap flex-shrink-0"
                              title="Remove room"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                              </svg>
                              Remove Room
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              }
              const item = row
              if (item.isHeader) {
                return (
                  <tr key={item.id} className="bg-slate-50/80">
                    <td colSpan={WALK_COL_COUNT} className="px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      {item.description}
                    </td>
                  </tr>
                )
              }

              const isDrv = item.coverage?.toUpperCase() === 'DRV'
              const override = getOverride(item.id)
              const isRemoved = override?.removed === true
              const hasNotes = (override?.notes?.length ?? 0) > 0
              const isModified = !isRemoved && !isDrv && (override?.qty !== undefined || hasNotes)

              const rowStyle = isDrv
                ? { backgroundColor: '#F1F5F9', opacity: 0.65 }
                : isRemoved
                  ? { backgroundColor: '#FEE2E2' }
                  : isModified
                    ? { backgroundColor: '#FEF9C3' }
                    : undefined

              return (
                <tr key={item.id} style={rowStyle} className="border-b border-slate-100 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-400 w-12">{item.rowNum}</td>
                  <td className="px-3 py-3 max-w-[220px]">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-[13px] ${isRemoved ? 'text-slate-400 line-through' : isDrv ? 'text-slate-400' : 'text-slate-800'}`}>
                        {item.description}
                      </span>
                      {isDrv && <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">DRV — excluded</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {item.activity ? (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-400 whitespace-nowrap">
                        {activityLabel(item.activity)}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-[13px] text-slate-500 whitespace-nowrap">
                    {item.qty > 0 ? (
                      <span>
                        {Number(item.qty).toLocaleString('en-US', { maximumFractionDigits: 2 })} {item.unit}
                        {!isDrv && override?.qty !== undefined && (
                          <span className="ml-2 text-amber-700 font-semibold">
                            → {Number(override.qty).toLocaleString('en-US', { maximumFractionDigits: 2 })} {item.unit}
                          </span>
                        )}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {isDrv
                      ? <span className="text-[13px] text-slate-300">—</span>
                      : item.rcv > 0 ? <span className="text-[13px] font-medium text-slate-800">{fmt(item.rcv)}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {item.note ? (
                      <button
                        onClick={() => setShowItemNote({ id: item.id, note: item.note })}
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                        title="View Inspection Notes"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {isDrv ? null : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRemove(item.id)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                            isRemoved
                              ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          {isRemoved ? 'Undo' : 'Remove'}
                        </button>
                        <button
                          onClick={() => openQtyPrompt(item.id)}
                          disabled={isRemoved}
                          className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 text-slate-600 rounded hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {override?.qty !== undefined ? 'Edit Qty' : 'Update Qty'}
                        </button>
                        {override?.qty !== undefined && !isRemoved && (
                          <button
                            onClick={() => updateWalkItem(projectId, walk.id, item.id, { qty: undefined })}
                            className="px-2.5 py-1 text-[11px] font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded hover:bg-amber-100 transition-colors whitespace-nowrap"
                          >
                            Revert Qty
                          </button>
                        )}
                        <button
                          onClick={() => openNotePrompt(item.id)}
                          className={`px-2.5 py-1 text-[11px] font-medium border rounded transition-colors whitespace-nowrap ${
                            hasNotes
                              ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Inspection Notes{hasNotes ? ` (${override!.notes!.length})` : ''}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Update Qty modal */}
      {qtyPrompt && qtyItem && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0"
          style={keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : undefined}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setQtyPrompt(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-6 w-full max-w-sm sm:mx-4 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Update Quantity</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                #{qtyItem.rowNum} &nbsp;·&nbsp; {qtyItem.description}
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-sm text-slate-600">
              <span className="text-xs text-slate-400">Original:</span>
              <span className="font-medium">
                {Number(qtyItem.qty).toLocaleString('en-US', { maximumFractionDigits: 2 })} {qtyItem.unit}
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">New quantity</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={qtyPrompt.value}
                  onChange={e => setQtyPrompt(p => p ? { ...p, value: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Enter') saveQty(); if (e.key === 'Escape') setQtyPrompt(null) }}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <span className="text-sm text-slate-500 flex-shrink-0">{qtyItem.unit}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setQtyPrompt(null)}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveQty}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Group Note modal */}
      {groupNotePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0"
          style={keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : undefined}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => { setGroupNotePrompt(null); setGroupNoteDeleteConfirm(null) }} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md sm:mx-4 flex flex-col" style={{ maxHeight: '85dvh' }}>
            {/* Scrollable body */}
            <div className="flex flex-col gap-4 p-6 pb-3 overflow-y-auto flex-1">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Add Group Note</h3>
                <p className="text-xs text-slate-400 mt-0.5">{roomLabel(groupNotePrompt.room, spanishMode)}</p>
              </div>

              {/* Existing group notes — scrollable list */}
              {groupNotes.filter(n => n.room === groupNotePrompt.room).length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-slate-500">
                    Existing notes ({groupNotes.filter(n => n.room === groupNotePrompt.room).length})
                  </p>
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-0.5">
                    {groupNotes.filter(n => n.room === groupNotePrompt.room).map(gn => (
                      <div key={gn.id} className="rounded-lg border border-teal-100 bg-teal-50 overflow-hidden flex-shrink-0">
                        {groupNoteDeleteConfirm === gn.id ? (
                          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <p className="text-xs text-slate-700">Delete this note?</p>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button onClick={() => setGroupNoteDeleteConfirm(null)} className="px-2.5 py-1 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors">Cancel</button>
                              <button onClick={() => { deleteWalkGroupNote(projectId, walk.id, gn.id); setGroupNoteDeleteConfirm(null) }} className="px-2.5 py-1 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium">Delete</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <p className="text-xs text-slate-700 leading-snug break-words">{gn.text}</p>
                              {gn.qty !== undefined && <p className="text-[10px] text-teal-600 font-medium">Qty: {gn.qty}</p>}
                              <p className="text-[10px] text-slate-400">{formatNoteDate(gn.createdAt)}</p>
                            </div>
                            <button onClick={() => setGroupNoteDeleteConfirm(gn.id)} className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors mt-0.5" title="Delete note">
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

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Note</label>
                <textarea
                  key={groupNotes.filter(n => n.room === groupNotePrompt.room).length}
                  rows={3}
                  placeholder="Enter a group note…"
                  value={groupNotePrompt.text}
                  onChange={e => setGroupNotePrompt(p => p ? { ...p, text: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Escape') { setGroupNotePrompt(null); setGroupNoteDeleteConfirm(null) } }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Proposed Quantity <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={groupNotePrompt.qty}
                    onChange={e => setGroupNotePrompt(p => p ? { ...p, qty: e.target.value } : null)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                {walkPresets.some(p => p.trim()) && (
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Presets</label>
                    <div className="grid grid-cols-2 gap-1">
                      {walkPresets.map((preset, i) =>
                        preset.trim() ? (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setGroupNotePrompt(p => p ? { ...p, text: p.text + preset + ' ' } : null)}
                            className="px-2 py-1.5 text-[11px] font-medium border border-slate-200 rounded-lg text-slate-700 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-800 transition-colors truncate text-left leading-tight"
                            title={preset}
                          >
                            {preset}
                          </button>
                        ) : (
                          <div key={i} />
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pinned action buttons */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => { setGroupNotePrompt(null); setGroupNoteDeleteConfirm(null) }} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                Close
              </button>
              <button
                onClick={saveGroupNote}
                disabled={!groupNotePrompt.text.trim()}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden gallery input */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { handlePhotoFiles(e.target.files, activePhotoRoom); e.target.value = '' }}
      />

      {/* Multi-shot camera */}
      {showCamera && (
        <CameraCapture
          onCapture={async (dataUrls) => {
            setShowCamera(false)
            if (dataUrls.length === 0) return
            setPhotoUploadProgress({ done: 0, total: dataUrls.length })
            for (let i = 0; i < dataUrls.length; i++) {
              const res = await fetch(dataUrls[i])
              const blob = await res.blob()
              const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
              await handlePhotoFiles(
                (() => { const dt = new DataTransfer(); dt.items.add(file); return dt.files })(),
                activePhotoRoom
              )
              setPhotoUploadProgress({ done: i + 1, total: dataUrls.length })
            }
            setPhotoUploadProgress(null)
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* All Walk Photos modal */}
      {showAllPhotos && (() => {
        const allPhotos = roomPhotos.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        const allSelected = allPhotos.length > 0 && allPhotos.every(p => bulkSelectedIds.has(p.id))
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => { if (!bulkActive) { setShowAllPhotos(false); setAllPhotoDeleteConfirm(null) } }} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col" style={{ maxHeight: '85vh' }}>
              <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Walk Photos</h3>
                  <p className="text-xs text-slate-400 mt-0.5">All rooms &nbsp;·&nbsp; {allPhotos.length} photo{allPhotos.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {bulkActive ? (
                    <>
                      <button
                        onClick={() => setBulkSelectedIds(allSelected ? new Set() : new Set(allPhotos.map(p => p.id)))}
                        className="text-xs text-blue-600 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                      <button
                        onClick={() => { setBulkActive(false); setBulkSelectedIds(new Set()); setBulkMoveTarget('') }}
                        className="text-xs font-medium px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setBulkActive(true)}
                      className="text-xs font-medium px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Select
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {allPhotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                    </svg>
                    <p className="text-sm">No photos yet. Use the buttons below to add some.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {allPhotos.map(photo => {
                      const isSelected = bulkSelectedIds.has(photo.id)
                      return (
                        <div
                          key={photo.id}
                          className={`relative group rounded-lg overflow-hidden ${bulkActive && isSelected ? 'ring-2 ring-blue-500' : ''}`}
                          onClick={() => bulkActive && toggleBulkSelect(photo.id)}
                        >
                          {bulkActive && (
                            <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-slate-400'}`}>
                                {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                            </div>
                          )}
                          <img
                            src={photo.data}
                            alt=""
                            className={`w-full aspect-square object-cover ${bulkActive ? 'cursor-pointer' : 'cursor-zoom-in'}`}
                            onClick={e => { if (!bulkActive) { e.stopPropagation(); setExpandedPhoto({ photos: allPhotos, index: allPhotos.findIndex(p => p.id === photo.id) }) } }}
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                            <p className="text-[9px] text-white font-medium leading-tight truncate">{roomLabel(photo.room, spanishMode)}</p>
                            <p className="text-[8px] text-white/70 leading-tight">{formatNoteDate(photo.createdAt)}</p>
                          </div>
                          {!bulkActive && (allPhotoDeleteConfirm === photo.id ? (
                            <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                              <p className="text-white text-[11px] font-medium">Delete photo?</p>
                              <div className="flex gap-2">
                                <button onClick={() => setAllPhotoDeleteConfirm(null)} className="px-2.5 py-1 text-[11px] bg-white/20 text-white rounded hover:bg-white/30 transition-colors">No</button>
                                <button onClick={() => { deleteWalkRoomPhoto(projectId, walk.id, photo.id); setAllPhotoDeleteConfirm(null) }} className="px-2.5 py-1 text-[11px] bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-medium">Yes</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); setAllPhotoDeleteConfirm(photo.id) }}
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Bulk actions bar */}
              {bulkActive && (
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex flex-wrap items-center gap-2">
                  {bulkDeleteConfirm ? (
                    <div className="flex items-center gap-3 w-full">
                      <span className="text-xs text-slate-700 font-medium flex-1">Delete {bulkSelectedIds.size} photo{bulkSelectedIds.size !== 1 ? 's' : ''}? This cannot be undone.</span>
                      <button onClick={() => setBulkDeleteConfirm(false)} className="px-3 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors">Cancel</button>
                      <button onClick={confirmBulkDelete} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium">Delete</button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs text-slate-500 font-medium">{bulkSelectedIds.size} selected</span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <select
                          value={bulkMoveTarget}
                          onChange={e => setBulkMoveTarget(e.target.value)}
                          className="text-xs border border-slate-200 rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Move to room…</option>
                          {availableRooms.map(r => (
                            <option key={r} value={r}>{r === '_general_' ? 'General Photos' : roomLabel(r, spanishMode)}</option>
                          ))}
                        </select>
                        <button
                          onClick={bulkMovePhotos}
                          disabled={!bulkMoveTarget || bulkSelectedIds.size === 0}
                          className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded disabled:opacity-40 whitespace-nowrap"
                        >
                          Move
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          if (!project) return
                          const selected = (walk.roomPhotos ?? []).filter(p => bulkSelectedIds.has(p.id))
                          downloadSelectedPhotos(selected, walk.name, project.name)
                        }}
                        disabled={bulkSelectedIds.size === 0}
                        className="px-2.5 py-1 text-xs bg-violet-600 text-white rounded disabled:opacity-40 whitespace-nowrap"
                      >
                        Download ({bulkSelectedIds.size})
                      </button>
                      <button
                        onClick={bulkDeleteSelected}
                        disabled={bulkSelectedIds.size === 0}
                        className="px-2.5 py-1 text-xs bg-red-600 text-white rounded disabled:opacity-40 whitespace-nowrap"
                      >
                        Delete ({bulkSelectedIds.size})
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-2 flex-shrink-0 flex-wrap">
                <button
                  onClick={() => openGeneralPhotoAction('gallery')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Upload
                </button>
                <button
                  onClick={() => openGeneralPhotoAction('camera')}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                  </svg>
                  Take Photos
                </button>
                {roomPhotos.length > 0 && project && (
                  <button
                    onClick={() => downloadWalkPhotos(walk, project.name)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download All
                  </button>
                )}
                <button
                  onClick={() => { setShowAllPhotos(false); setAllPhotoDeleteConfirm(null); setBulkActive(false); setBulkSelectedIds(new Set()); setBulkDeleteConfirm(false) }}
                  className="ml-auto px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Photos modal (room-specific) */}
      {photoModal && (() => {
        const modalPhotos = roomPhotos.filter(p => p.room === photoModal.room)
        const allSelected = modalPhotos.length > 0 && modalPhotos.every(p => bulkSelectedIds.has(p.id))
        const otherRooms = availableRooms.filter(r => r !== photoModal.room)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => { if (!bulkActive) { setPhotoModal(null); setPhotoDeleteConfirm(null) } }} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col" style={{ maxHeight: '85vh' }}>
              <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Photos</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{roomLabel(photoModal.room, spanishMode)} &nbsp;·&nbsp; {modalPhotos.length} photo{modalPhotos.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {bulkActive ? (
                    <>
                      <button
                        onClick={() => setBulkSelectedIds(allSelected ? new Set() : new Set(modalPhotos.map(p => p.id)))}
                        className="text-xs text-blue-600 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                      <button
                        onClick={() => { setBulkActive(false); setBulkSelectedIds(new Set()); setBulkMoveTarget('') }}
                        className="text-xs font-medium px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setBulkActive(true)}
                      className="text-xs font-medium px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Select
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {modalPhotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                    </svg>
                    <p className="text-sm">No photos yet. Use the buttons below to add some.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {modalPhotos.map(photo => {
                      const isSelected = bulkSelectedIds.has(photo.id)
                      return (
                        <div
                          key={photo.id}
                          className={`relative group rounded-lg overflow-hidden ${bulkActive && isSelected ? 'ring-2 ring-blue-500' : ''}`}
                          onClick={() => bulkActive && toggleBulkSelect(photo.id)}
                        >
                          {bulkActive && (
                            <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-slate-400'}`}>
                                {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                            </div>
                          )}
                          <img
                            src={photo.data}
                            alt=""
                            className={`w-full aspect-square object-cover ${bulkActive ? 'cursor-pointer' : 'cursor-zoom-in'}`}
                            onClick={e => { if (!bulkActive) { e.stopPropagation(); setExpandedPhoto({ photos: modalPhotos, index: modalPhotos.findIndex(p => p.id === photo.id) }) } }}
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                            <p className="text-[9px] text-white/80 leading-tight">{formatNoteDate(photo.createdAt)}</p>
                          </div>
                          {!bulkActive && (photoDeleteConfirm === photo.id ? (
                            <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                              <p className="text-white text-[11px] font-medium">Delete photo?</p>
                              <div className="flex gap-2">
                                <button onClick={() => setPhotoDeleteConfirm(null)} className="px-2.5 py-1 text-[11px] bg-white/20 text-white rounded hover:bg-white/30 transition-colors">No</button>
                                <button onClick={() => { deleteWalkRoomPhoto(projectId, walk.id, photo.id); setPhotoDeleteConfirm(null) }} className="px-2.5 py-1 text-[11px] bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-medium">Yes</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); setPhotoDeleteConfirm(photo.id) }}
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Bulk actions bar */}
              {bulkActive && (
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex flex-wrap items-center gap-2">
                  {bulkDeleteConfirm ? (
                    <div className="flex items-center gap-3 w-full">
                      <span className="text-xs text-slate-700 font-medium flex-1">Delete {bulkSelectedIds.size} photo{bulkSelectedIds.size !== 1 ? 's' : ''}? This cannot be undone.</span>
                      <button onClick={() => setBulkDeleteConfirm(false)} className="px-3 py-1 text-xs border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors">Cancel</button>
                      <button onClick={confirmBulkDelete} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium">Delete</button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs text-slate-500 font-medium">{bulkSelectedIds.size} selected</span>
                      {otherRooms.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <select
                            value={bulkMoveTarget}
                            onChange={e => setBulkMoveTarget(e.target.value)}
                            className="text-xs border border-slate-200 rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Move to room…</option>
                            {otherRooms.map(r => (
                              <option key={r} value={r}>{r === '_general_' ? 'General Photos' : roomLabel(r, spanishMode)}</option>
                            ))}
                          </select>
                          <button
                            onClick={bulkMovePhotos}
                            disabled={!bulkMoveTarget || bulkSelectedIds.size === 0}
                            className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded disabled:opacity-40 whitespace-nowrap"
                          >
                            Move
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          if (!project) return
                          const selected = (walk.roomPhotos ?? []).filter(p => bulkSelectedIds.has(p.id))
                          downloadSelectedPhotos(selected, walk.name, project.name)
                        }}
                        disabled={bulkSelectedIds.size === 0}
                        className="px-2.5 py-1 text-xs bg-violet-600 text-white rounded disabled:opacity-40 whitespace-nowrap"
                      >
                        Download ({bulkSelectedIds.size})
                      </button>
                      <button
                        onClick={bulkDeleteSelected}
                        disabled={bulkSelectedIds.size === 0}
                        className="px-2.5 py-1 text-xs bg-red-600 text-white rounded disabled:opacity-40 whitespace-nowrap"
                      >
                        Delete ({bulkSelectedIds.size})
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-2 flex-shrink-0 flex-wrap">
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Upload
                </button>
                <button
                  onClick={() => setShowCamera(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                  </svg>
                  Take Photos
                </button>
                {roomPhotos.length > 0 && project && (
                  <button
                    onClick={() => downloadWalkPhotos(walk, project.name)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-50 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download All
                  </button>
                )}
                <button
                  onClick={() => { setPhotoModal(null); setPhotoDeleteConfirm(null); setBulkActive(false); setBulkSelectedIds(new Set()) }}
                  className="ml-auto px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Gallery viewer — portal to document.body to escape any stacking context */}
      {expandedPhoto && createPortal(
        <div
          className="fixed inset-0 bg-black/92 flex items-center justify-center select-none"
          style={{ zIndex: 9999 }}
          onTouchStart={e => { gallerySwipeX.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            if (gallerySwipeX.current === null) return
            const dx = e.changedTouches[0].clientX - gallerySwipeX.current
            gallerySwipeX.current = null
            if (dx > 50 && expandedPhoto.index > 0)
              setExpandedPhoto({ photos: expandedPhoto.photos, index: expandedPhoto.index - 1 })
            else if (dx < -50 && expandedPhoto.index < expandedPhoto.photos.length - 1)
              setExpandedPhoto({ photos: expandedPhoto.photos, index: expandedPhoto.index + 1 })
          }}
        >
          {/* Backdrop — tap to close */}
          <div className="absolute inset-0" onClick={() => setExpandedPhoto(null)} />

          {/* Photo */}
          <img
            src={expandedPhoto.photos[expandedPhoto.index].data}
            alt=""
            className="relative max-w-full object-contain pointer-events-none"
            style={{ maxHeight: 'calc(100dvh - 80px)', padding: '0 48px' }}
          />

          {/* Counter */}
          {expandedPhoto.photos.length > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs font-semibold px-3 py-1 rounded-full pointer-events-none">
              {expandedPhoto.index + 1} / {expandedPhoto.photos.length}
            </div>
          )}

          {/* Download current photo */}
          <button
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
            onClick={e => {
              e.stopPropagation()
              const photo = expandedPhoto!.photos[expandedPhoto!.index]
              const ext = photo.data.startsWith('data:image/webp') ? 'webp' : photo.data.startsWith('data:image/png') ? 'png' : 'jpg'
              const a = document.createElement('a')
              a.href = photo.data
              a.download = `photo_${String(expandedPhoto!.index + 1).padStart(2, '0')}.${ext}`
              a.click()
            }}
            title="Download photo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>

          {/* Close */}
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
            onClick={() => setExpandedPhoto(null)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Prev */}
          {expandedPhoto.index > 0 && (
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/35 transition-colors"
              onClick={e => { e.stopPropagation(); setExpandedPhoto({ photos: expandedPhoto.photos, index: expandedPhoto.index - 1 }) }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}

          {/* Next */}
          {expandedPhoto.index < expandedPhoto.photos.length - 1 && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/35 transition-colors"
              onClick={e => { e.stopPropagation(); setExpandedPhoto({ photos: expandedPhoto.photos, index: expandedPhoto.index + 1 }) }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )}

          {/* Dot indicators */}
          {expandedPhoto.photos.length > 1 && expandedPhoto.photos.length <= 20 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
              {expandedPhoto.photos.map((_, i) => (
                <div key={i} className={`rounded-full transition-all ${i === expandedPhoto.index ? 'w-2 h-2 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`} />
              ))}
            </div>
          )}
        </div>,
        document.body
      )}

      {/* General Notes modal */}
      {generalNotePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setGeneralNotePrompt(null); setGeneralNoteDeleteConfirm(null) }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col" style={{ maxHeight: '85dvh' }}>
            {/* Scrollable body */}
            <div className="flex flex-col gap-4 p-6 pb-3 overflow-y-auto flex-1">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">General Notes</h3>
                <p className="text-xs text-slate-400 mt-0.5">Notes attached to this walk report, not tied to any room.</p>
              </div>

              {generalNotes.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-slate-500">
                    Existing notes ({generalNotes.length})
                  </p>
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-0.5">
                    {generalNotes.map(gn => (
                      <div key={gn.id} className="rounded-lg border border-amber-100 bg-amber-50 overflow-hidden flex-shrink-0">
                        {generalNoteDeleteConfirm === gn.id ? (
                          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <p className="text-xs text-slate-700">Delete this note?</p>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button onClick={() => setGeneralNoteDeleteConfirm(null)} className="px-2.5 py-1 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors">Cancel</button>
                              <button onClick={() => { deleteWalkGeneralNote(projectId, walk.id, gn.id); setGeneralNoteDeleteConfirm(null) }} className="px-2.5 py-1 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium">Delete</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <p className="text-xs text-slate-700 leading-snug break-words">{gn.text}</p>
                              {gn.qty !== undefined && <p className="text-[10px] text-amber-600 font-medium">Qty: {gn.qty}</p>}
                              <p className="text-[10px] text-slate-400">{formatNoteDate(gn.createdAt)}</p>
                            </div>
                            <button onClick={() => setGeneralNoteDeleteConfirm(gn.id)} className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors mt-0.5" title="Delete note">
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

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Note</label>
                <textarea
                  key={generalNotes.length}
                  rows={3}
                  placeholder="Enter a general note…"
                  value={generalNotePrompt.text}
                  onChange={e => setGeneralNotePrompt(p => p ? { ...p, text: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Escape') { setGeneralNotePrompt(null); setGeneralNoteDeleteConfirm(null) } }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Proposed Quantity <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={generalNotePrompt.qty}
                    onChange={e => setGeneralNotePrompt(p => p ? { ...p, qty: e.target.value } : null)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                {walkPresets.some(p => p.trim()) && (
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Presets</label>
                    <div className="grid grid-cols-2 gap-1">
                      {walkPresets.map((preset, i) =>
                        preset.trim() ? (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setGeneralNotePrompt(p => p ? { ...p, text: p.text + preset + ' ' } : null)}
                            className="px-2 py-1.5 text-[11px] font-medium border border-slate-200 rounded-lg text-slate-700 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-800 transition-colors truncate text-left leading-tight"
                            title={preset}
                          >
                            {preset}
                          </button>
                        ) : (
                          <div key={i} />
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pinned action buttons */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => { setGeneralNotePrompt(null); setGeneralNoteDeleteConfirm(null) }} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                Close
              </button>
              <button
                onClick={saveGeneralNote}
                disabled={!generalNotePrompt.text.trim()}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room picker modal — shown before camera/gallery in Walk Photos */}
      {pendingPhotoAction && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPendingPhotoAction(null)} />
          <div
            className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md mx-0 sm:mx-4 flex flex-col"
            style={{ maxHeight: '82vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Handle bar (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            {/* Header */}
            <div className="px-6 pt-4 pb-3 flex-shrink-0 sm:pt-6">
              <h3 className="text-base font-semibold text-slate-900">Assign to Room</h3>
              <p className="text-sm text-slate-500 mt-0.5">Which room does this photo belong to?</p>
            </div>

            {/* Room list — scrollable */}
            <div className="flex-1 overflow-y-auto px-4 pb-2">
              <div className="flex flex-col gap-2">
                {availableRooms.map(r => {
                  const isSelected = photoRoomPickerRoom === r
                  return (
                    <button
                      key={r}
                      onClick={() => setPhotoRoomPickerRoom(r)}
                      className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </span>
                      <span className={`text-sm font-medium leading-tight ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                        {r === '_general_' ? 'General Photos' : roomLabel(r, spanishMode)}
                      </span>
                    </button>
                  )
                })}

                {/* Add new room */}
                {addingRoomInPicker ? (
                  <div className="flex flex-col gap-2 px-1 pt-1 pb-2">
                    <input
                      type="text"
                      placeholder="New room name…"
                      value={newRoomInPicker}
                      onChange={e => setNewRoomInPicker(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addRoomFromPicker(); if (e.key === 'Escape') setAddingRoomInPicker(false) }}
                      className="w-full px-4 py-3.5 text-sm border-2 border-violet-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setAddingRoomInPicker(false)} className="flex-1 py-3 text-sm border-2 border-slate-200 rounded-xl text-slate-600 font-medium">Cancel</button>
                      <button onClick={addRoomFromPicker} disabled={!newRoomInPicker.trim()} className="flex-1 py-3 text-sm bg-violet-600 text-white rounded-xl font-medium disabled:opacity-40">Add Room</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingRoomInPicker(true)}
                    className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed border-violet-300 text-violet-600 hover:bg-violet-50 transition-colors"
                  >
                    <span className="w-5 h-5 rounded-full border-2 border-violet-400 flex items-center justify-center flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </span>
                    <span className="text-sm font-medium">Add New Room</span>
                  </button>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-4 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setPendingPhotoAction(null)}
                className="flex-1 py-3.5 text-sm border-2 border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmPhotoRoomPick}
                className="flex-1 py-3.5 text-sm bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                {pendingPhotoAction === 'camera' ? 'Open Camera' : 'Choose File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Notes modal */}
      {notePrompt && noteItem && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0"
          style={keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : undefined}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => { setNotePrompt(null); setConfirmDeleteIdx(null) }} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-6 w-full max-w-md sm:mx-4 flex flex-col gap-4 max-h-[80dvh] overflow-y-auto">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Inspection Notes</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                #{noteItem.rowNum} &nbsp;·&nbsp; {noteItem.description}
              </p>
            </div>

            {/* Previous notes */}
            {(noteItemOverride?.notes?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-slate-500">Previous notes</p>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {noteItemOverride!.notes!.map((n, i) => (
                    <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
                      {confirmDeleteIdx === i ? (
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <p className="text-xs text-slate-700">Delete this note?</p>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => setConfirmDeleteIdx(null)}
                              className="px-2.5 py-1 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => deleteNote(notePrompt.itemId, i)}
                              className="px-2.5 py-1 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <p className="text-xs text-slate-700 leading-snug break-words">{n.text}</p>
                            <p className="text-[10px] text-slate-400">{formatNoteDate(n.createdAt)}</p>
                          </div>
                          <button
                            onClick={() => setConfirmDeleteIdx(i)}
                            className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors mt-0.5"
                            title="Delete note"
                          >
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

            {/* New note input */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">New note</label>
              <textarea
                rows={3}
                placeholder="Enter an inspection note…"
                value={notePrompt.value}
                onChange={e => setNotePrompt(p => p ? { ...p, value: e.target.value } : null)}
                onKeyDown={e => { if (e.key === 'Escape') { setNotePrompt(null); setConfirmDeleteIdx(null) } }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setNotePrompt(null); setConfirmDeleteIdx(null) }}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={saveNote}
                disabled={!notePrompt.value.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export options modal */}
      {showExportOptions && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowExportOptions(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm flex flex-col max-h-[82dvh] overflow-y-auto">
            <div className="p-5 flex flex-col gap-4">
              <h3 className="text-base font-semibold text-slate-900">Export Report</h3>

              {/* Content options */}
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Report Content</p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportIncludePhotos}
                    onChange={e => setExportIncludePhotos(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800">Include photos</p>
                    <p className="text-xs text-slate-400 mt-0.5">Embed room and general photos in the report</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportAdjustedOnly}
                    onChange={e => setExportAdjustedOnly(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800">Adjusted items only</p>
                    <p className="text-xs text-slate-400 mt-0.5">Only show removed, qty-changed, or noted items</p>
                  </div>
                </label>
              </div>

              <div className="border-t border-slate-100" />

              {/* Export PDF */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    setShowExportOptions(false)
                    if (project) openWalkReportPdf(project, walk, items, { adjustedOnly: exportAdjustedOnly, includePhotos: exportIncludePhotos })
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export Report
                </button>
                <p className="text-[11px] text-center text-slate-400">Opens report with Save PDF button</p>
              </div>

              <div className="border-t border-slate-100" />

              {/* Send Report */}
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Send Report</p>
                <div className="flex gap-2">
                  {(['report', 'photos', 'both'] as const).map(opt => {
                    const labels = { report: 'Report', photos: 'Photos', both: 'Both' }
                    const hasPhotos = (walk.roomPhotos?.length ?? 0) > 0
                    const disabled = (opt === 'photos' || opt === 'both') && !hasPhotos
                    return (
                      <button
                        key={opt}
                        onClick={() => !disabled && setSendType(opt)}
                        disabled={disabled}
                        className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                          sendType === opt
                            ? 'bg-blue-600 text-white border-blue-600'
                            : disabled
                            ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                        }`}
                      >
                        {labels[opt]}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  {sendType === 'report' && 'HTML file — open in any browser, print to PDF'}
                  {sendType === 'photos' && `ZIP of ${walk.roomPhotos?.length ?? 0} photos organized by room`}
                  {sendType === 'both' && 'Report + photo ZIP, both attached'}
                </p>
                <button
                  onClick={handleSend}
                  disabled={sharePrepping}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 active:bg-emerald-800 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  {sharePrepping ? 'Preparing…' : ('share' in navigator ? 'Share' : 'Download')}
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 p-4">
              <button
                onClick={() => setShowExportOptions(false)}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo upload progress */}
      {photoUploadProgress && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center pointer-events-none pb-[calc(80px+env(safe-area-inset-bottom))] sm:pb-0">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 px-6 py-5 w-72 pointer-events-auto">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-blue-500 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <p className="text-sm font-semibold text-slate-800">Saving photos…</p>
            </div>
            <p className="text-xs text-slate-400 mb-3">{photoUploadProgress.done} of {photoUploadProgress.total} complete</p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${(photoUploadProgress.done / photoUploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Inspection Notes (Note 1 from Excel) viewer */}
      {showItemNote && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowItemNote(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-5 w-full max-w-sm sm:mx-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-900">Inspection Notes</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              {showItemNote.note}
            </p>
            <button
              onClick={() => setShowItemNote(null)}
              className="w-full py-2 text-sm font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
