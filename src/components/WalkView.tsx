import { useState, useRef, useEffect } from 'react'
import type { ScopeItem, Walk, WalkNote, WalkGroupNote, WalkRoomPhoto, WalkGeneralNote } from '../types'
import { useStore } from '../store/useStore'
import { generateWalkReport } from '../lib/exportReport'
import { downloadWalkPhotos } from '../lib/downloadPhotos'
import { uploadPhotoToOneDrive } from '../lib/oneDrive'

const WALK_COL_COUNT = 7

type RenderRow = ScopeItem | { _roomHeader: true; room: string; id: string } | { _groupNote: true; note: WalkGroupNote; id: string }

function roomLabel(r: string) {
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
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const ts = new Date().toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        })
        const label = `${projectName}  ·  ${ts}`
        const fontSize = Math.max(14, Math.round(img.naturalWidth / 50))
        const pad = Math.round(fontSize * 0.6)
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(img.naturalWidth - tw - pad * 2, img.naturalHeight - fontSize - pad * 2, tw + pad * 2, fontSize + pad * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, img.naturalWidth - tw - pad, img.naturalHeight - pad)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatNoteDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

interface Props {
  projectId: string
  walk: Walk
  items: ScopeItem[]
  roomFilter: string
  onRoomDeleted?: () => void
}

export function WalkView({ projectId, walk, items, roomFilter, onRoomDeleted }: Props) {
  const { updateWalkItem, addWalkGroupNote, deleteWalkGroupNote, addWalkRoomPhoto, deleteWalkRoomPhoto, addWalkGeneralNote, deleteWalkGeneralNote, deleteWalkCustomRoom, projects, oneDrive } = useStore()
  const project = projects.find(p => p.id === projectId)
  const [search, setSearch] = useState('')
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
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function getOverride(itemId: string) {
    return (walk.itemOverrides ?? []).find(o => o.itemId === itemId)
  }

  function handleRemove(itemId: string) {
    const override = getOverride(itemId)
    updateWalkItem(projectId, walk.id, itemId, { removed: !override?.removed })
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
    setPhotoModal({ room })
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
  const renderRows = buildRenderRows(pruned, roomFilter, groupNotes, customRooms)
  const qtyItem = qtyPrompt ? items.find(i => i.id === qtyPrompt.itemId) : null
  const noteItem = notePrompt ? items.find(i => i.id === notePrompt.itemId) : null
  const noteItemOverride = notePrompt ? getOverride(notePrompt.itemId) : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white flex-shrink-0">
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
                <span className="text-xs text-red-700 font-medium whitespace-nowrap">Remove "{roomLabel(roomFilter)}"?</span>
                <button
                  onClick={() => setRemoveRoomConfirm(false)}
                  className="px-2 py-0.5 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    deleteWalkCustomRoom(projectId, walk.id, roomFilter)
                    setRemoveRoomConfirm(false)
                    onRoomDeleted?.()
                  }}
                  className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => setRemoveRoomConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Remove Room
              </button>
            )
          )}
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
            onClick={() => project && generateWalkReport(project, walk, items)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export Report
          </button>
        </div>
      </div>

      {/* Table */}
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
                return (
                  <tr key={row.id}>
                    <td colSpan={WALK_COL_COUNT} className="sticky top-10 z-[5] px-4 pt-5 pb-2 bg-white">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">
                          {roomLabel(row.room)}
                        </span>
                        <div className="flex-1 h-px bg-slate-200" />
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
                  <td className="px-3 py-3 max-w-[180px] text-[12px] text-slate-500">
                    {item.note || <span className="text-slate-300">—</span>}
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
                          Update Qty
                        </button>
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

      {/* Update Qty modal */}
      {qtyPrompt && qtyItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setQtyPrompt(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setGroupNotePrompt(null); setGroupNoteDeleteConfirm(null) }} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Add Group Note</h3>
              <p className="text-xs text-slate-400 mt-0.5">{roomLabel(groupNotePrompt.room)}</p>
            </div>

            {/* Existing group notes for this room */}
            {groupNotes.filter(n => n.room === groupNotePrompt.room).length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-slate-500">Existing group notes</p>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                  {groupNotes.filter(n => n.room === groupNotePrompt.room).map(gn => (
                    <div key={gn.id} className="rounded-lg border border-teal-100 bg-teal-50 overflow-hidden">
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
                rows={3}
                placeholder="Enter a group note…"
                value={groupNotePrompt.text}
                onChange={e => setGroupNotePrompt(p => p ? { ...p, text: e.target.value } : null)}
                onKeyDown={e => { if (e.key === 'Escape') { setGroupNotePrompt(null); setGroupNoteDeleteConfirm(null) } }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                autoFocus
              />
            </div>

            <div>
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

            <div className="flex justify-end gap-2">
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

      {/* Hidden file inputs */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { if (photoModal) handlePhotoFiles(e.target.files, photoModal.room); e.target.value = '' }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { if (photoModal) handlePhotoFiles(e.target.files, photoModal.room); e.target.value = '' }}
      />

      {/* Photos modal */}
      {photoModal && (() => {
        const modalPhotos = roomPhotos.filter(p => p.room === photoModal.room)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => { setPhotoModal(null); setPhotoDeleteConfirm(null) }} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col" style={{ maxHeight: '85vh' }}>
              <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0">
                <h3 className="text-sm font-semibold text-slate-900">Photos</h3>
                <p className="text-xs text-slate-400 mt-0.5">{roomLabel(photoModal.room)} &nbsp;·&nbsp; {modalPhotos.length} photo{modalPhotos.length !== 1 ? 's' : ''}</p>
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
                    {modalPhotos.map(photo => (
                      <div key={photo.id} className="relative group rounded-lg overflow-hidden">
                        <img
                          src={photo.data}
                          alt=""
                          className="w-full aspect-square object-cover cursor-pointer"
                          onClick={() => setExpandedPhoto(photo.data)}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                          <p className="text-[9px] text-white/80 leading-tight">{formatNoteDate(photo.createdAt)}</p>
                        </div>
                        {photoDeleteConfirm === photo.id ? (
                          <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-2">
                            <p className="text-white text-[11px] font-medium">Delete photo?</p>
                            <div className="flex gap-2">
                              <button onClick={() => setPhotoDeleteConfirm(null)} className="px-2.5 py-1 text-[11px] bg-white/20 text-white rounded hover:bg-white/30 transition-colors">No</button>
                              <button onClick={() => { deleteWalkRoomPhoto(projectId, walk.id, photo.id); setPhotoDeleteConfirm(null) }} className="px-2.5 py-1 text-[11px] bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-medium">Yes</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPhotoDeleteConfirm(photo.id)}
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Upload Photos
                </button>
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                  </svg>
                  Take Photo
                </button>
                <button
                  onClick={() => { setPhotoModal(null); setPhotoDeleteConfirm(null) }}
                  className="ml-auto px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Expanded photo overlay */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85"
          onClick={() => setExpandedPhoto(null)}
        >
          <img src={expandedPhoto} alt="" className="max-w-full max-h-full object-contain p-4" />
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
            onClick={() => setExpandedPhoto(null)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* General Notes modal */}
      {generalNotePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setGeneralNotePrompt(null); setGeneralNoteDeleteConfirm(null) }} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">General Notes</h3>
              <p className="text-xs text-slate-400 mt-0.5">Notes attached to this walk report, not tied to any room.</p>
            </div>

            {generalNotes.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-slate-500">Existing notes</p>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                  {generalNotes.map(gn => (
                    <div key={gn.id} className="rounded-lg border border-amber-100 bg-amber-50 overflow-hidden">
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
                rows={3}
                placeholder="Enter a general note…"
                value={generalNotePrompt.text}
                onChange={e => setGeneralNotePrompt(p => p ? { ...p, text: e.target.value } : null)}
                onKeyDown={e => { if (e.key === 'Escape') { setGeneralNotePrompt(null); setGeneralNoteDeleteConfirm(null) } }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                autoFocus
              />
            </div>

            <div>
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

            <div className="flex justify-end gap-2">
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

      {/* Inspection Notes modal */}
      {notePrompt && noteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setNotePrompt(null); setConfirmDeleteIdx(null) }} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
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
    </div>
  )
}
