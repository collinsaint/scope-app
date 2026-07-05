import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useStore } from '../store/useStore'
import { SKETCH_LABELS } from '../types'
import type { SketchLabel } from '../types'
import { parseExcelFile, mergeItems } from '../lib/parseExcel'
import { generateReport } from '../lib/exportReport'
import { SummaryCards } from './SummaryCards'
import { ScopeTable } from './ScopeTable'
import { SubcontractorManager } from './SubcontractorManager'
import { CommentsView } from './CommentsView'
import { ProjectDetailsView } from './ProjectDetailsView'
import { SketchViewer } from './SketchViewer'
import { WalkView } from './WalkView'
import { NewWalkModal } from './NewWalkModal'

interface Props {
  projectId: string
  onBack: () => void
  initialView?: 'scope' | 'comments' | 'details'
}

export function ProjectView({ projectId, onBack, initialView = 'scope' }: Props) {
  const { projects, updateProjectItems, setComment, globalSubcontractors, addWalk, addSketch, removeSketch, addWalkCustomRoom } = useStore()
  const project = projects.find(p => p.id === projectId)
  const [roomFilter, setRoomFilter] = useState('all')
  const [reuploadError, setReuploadError] = useState('')
  const [showSubManager, setShowSubManager] = useState(false)
  const [activeView, setActiveView] = useState<'scope' | 'comments' | 'details'>(initialView)
  const [commentItemId, setCommentItemId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [showSketchViewer, setShowSketchViewer] = useState(false)
  const [showSketchUpload, setShowSketchUpload] = useState(false)
  const [sketchUploading, setSketchUploading] = useState(false)
  const [sketchLabel, setSketchLabel] = useState<SketchLabel>(SKETCH_LABELS[0])
  const sketchUploadRef = useRef<HTMLInputElement>(null)
  const [showNewWalk, setShowNewWalk] = useState(false)
  const [addRoomName, setAddRoomName] = useState<string | null>(null)
  const [activeWalkId, setActiveWalkId] = useState<string | null>(() => {
    const proj = useStore.getState().projects.find(p => p.id === projectId)
    if (proj?.projectStatus === 'Site Visit' && proj.walks?.length) {
      return proj.walks[0].id
    }
    return null
  })
  const prevStatusRef = useRef(project?.projectStatus)
  useEffect(() => {
    if (prevStatusRef.current === 'Site Visit' && project?.projectStatus !== 'Site Visit') {
      setActiveWalkId(null)
    }
    prevStatusRef.current = project?.projectStatus
  }, [project?.projectStatus])

  function openComment(itemId: string) {
    const item = project?.items.find(i => i.id === itemId)
    setCommentDraft(item?.comment ?? '')
    setCommentItemId(itemId)
  }

  function saveComment() {
    if (!commentItemId || !project) return
    setComment(projectId, commentItemId, commentDraft)
    setCommentItemId(null)
  }

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted[0] || !project) return
    setReuploadError('')
    try {
      const buffer = await accepted[0].arrayBuffer()
      const incoming = parseExcelFile(buffer)
      const merged = mergeItems(project.items, incoming)
      updateProjectItems(projectId, merged)
    } catch {
      setReuploadError('Could not parse the file.')
    }
  }, [project, projectId, updateProjectItems])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
  })

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-400">Project not found.</p>
      </div>
    )
  }

  const subcontractors = globalSubcontractors
  const dataItems = project.items.filter(i => !i.isHeader)
  const activeWalk = (project.walks ?? []).find(w => w.id === activeWalkId)
  const baseRooms = Array.from(new Set(project.items.map(i => i.room)))
  const walkCustomRooms = activeWalkId ? (activeWalk?.customRooms ?? []) : []
  const rooms = ['all', ...baseRooms, ...walkCustomRooms.filter(r => !baseRooms.includes(r))]

  function roomLabel(r: string) {
    if (r === 'all') return 'All rooms'
    return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  function roomProgress(r: string) {
    const items = (r === 'all' ? project!.items : project!.items.filter(i => i.room === r))
      .filter(i => !i.isHeader)
    if (!items.length) return { pct: 0, count: 0 }
    const done = items.filter(i => i.completed).length
    return { pct: Math.round(done / items.length * 100), count: items.length }
  }

  return (
    <div {...getRootProps()} className={`flex-1 flex flex-col overflow-hidden min-h-0 ${isDragActive ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
      <input {...getInputProps()} />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (activeView === 'details' && initialView !== 'details') {
                setActiveView('scope')
              } else {
                onBack()
              }
            }}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-base font-semibold text-slate-900">{project.name}</h1>
              <p className="text-xs text-slate-400">
                {project.address || 'No address'} &nbsp;·&nbsp; {dataItems.length} items &nbsp;·&nbsp; {project.fileName}
              </p>
            </div>
            <button
              onClick={() => { setActiveView(v => v === 'details' ? 'scope' : 'details') }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors flex-shrink-0 ${
                activeView === 'details'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Project Info
            </button>

            {/* Scope / Walk switcher */}
            <select
              value={activeWalkId ?? ''}
              onChange={e => {
                const val = e.target.value
                setActiveWalkId(val || null)
                setActiveView('scope')
              }}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">Main Scope</option>
              {(project.walks ?? []).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowNewWalk(true)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
              title="New Walk"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reuploadError && <span className="text-xs text-red-500">{reuploadError}</span>}

          <button
            onClick={() => {
              if ((project.sketches?.length ?? 0) > 0) {
                setShowSketchViewer(true)
              } else {
                setSketchLabel(SKETCH_LABELS[0])
                setShowSketchUpload(true)
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            View Sketch
            {(project.sketches?.length ?? 0) > 0 && (
              <span className="ml-0.5 bg-slate-200 text-slate-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {project.sketches!.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveView(v => v === 'comments' ? 'scope' : 'comments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
              activeView === 'comments'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Comments
            {project.items.some(i => i.comment) && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                activeView === 'comments' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'
              }`}>
                {project.items.filter(i => i.comment).length}
              </span>
            )}
          </button>


          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Re-upload scope
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async e => {
              const f = e.target.files?.[0]
              if (!f) return
              await onDrop([f])
              e.target.value = ''
            }} />
          </label>

          <button
            onClick={() => generateReport(project)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export report
          </button>
        </div>
      </div>

      {/* Summary cards — hidden on details view and walk view */}
      {activeView !== 'details' && !activeWalkId && (
        <div className="bg-white border-b border-slate-100 flex-shrink-0">
          <SummaryCards items={project.items} />
        </div>
      )}

      {/* Room tabs — hidden on details view */}
      {activeView !== 'details' && (
        <div className="flex flex-wrap gap-2 px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
          {rooms.map(r => {
            const { pct, count } = roomProgress(r)
            const isActive = roomFilter === r
            const isCustom = walkCustomRooms.includes(r)
            return (
              <button
                key={r}
                onClick={() => { setRoomFilter(r); setActiveView('scope') }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : isCustom
                      ? 'bg-violet-50 text-violet-700 border-violet-200 hover:border-violet-300'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {roomLabel(r)}
                {r !== 'all' && !isCustom && (
                  <span className={`text-[10px] ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>{count}</span>
                )}
                {r !== 'all' && !isCustom && pct > 0 && (
                  <span className={`flex items-center gap-0.5 text-[10px] font-medium ${isActive ? 'text-slate-300' : pct === 100 ? 'text-green-500' : 'text-blue-500'}`}>
                    {pct}%
                  </span>
                )}
              </button>
            )
          })}
          {activeWalkId && (
            <button
              onClick={() => setAddRoomName('')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-slate-300 text-slate-400 hover:border-violet-400 hover:text-violet-600 transition-colors whitespace-nowrap"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Room
            </button>
          )}
        </div>
      )}

      {/* Add Room modal */}
      {addRoomName !== null && activeWalkId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAddRoomName(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-900">Add Room</h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Room name</label>
              <input
                type="text"
                placeholder="e.g. Garage, Basement, Hallway"
                value={addRoomName}
                onChange={e => setAddRoomName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && addRoomName.trim()) {
                    const name = addRoomName.trim()
                    addWalkCustomRoom(projectId, activeWalkId, name)
                    setRoomFilter(name)
                    setActiveView('scope')
                    setAddRoomName(null)
                  }
                  if (e.key === 'Escape') setAddRoomName(null)
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAddRoomName(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                disabled={!addRoomName.trim()}
                onClick={() => {
                  const name = addRoomName.trim()
                  addWalkCustomRoom(projectId, activeWalkId, name)
                  setRoomFilter(name)
                  setActiveView('scope')
                  setAddRoomName(null)
                }}
                className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-white flex flex-col">
        {activeView === 'scope' && activeWalkId ? (
          <WalkView
            projectId={projectId}
            walk={(project.walks ?? []).find(w => w.id === activeWalkId)!}
            items={project.items}
            roomFilter={roomFilter}
            onRoomDeleted={() => setRoomFilter('all')}
          />
        ) : activeView === 'scope' && project.items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
              <svg className="text-slate-300" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">No scope uploaded yet</p>
              <p className="text-xs text-slate-400 mt-1">Upload a Main Scope Excel file to get started.</p>
            </div>
            <label className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Upload Main Scope
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async e => {
                const f = e.target.files?.[0]
                if (!f) return
                await onDrop([f])
                e.target.value = ''
              }} />
            </label>
          </div>
        ) : activeView === 'scope' ? (
          <ScopeTable
            projectId={projectId}
            items={project.items}
            subcontractors={subcontractors}
            roomFilter={roomFilter}
            onOpenComment={openComment}
          />
        ) : activeView === 'comments' ? (
          <CommentsView
            items={project.items}
            onEditComment={(itemId) => { openComment(itemId) }}
          />
        ) : (
          <ProjectDetailsView project={project} />
        )}
      </div>

      {/* Comment modal */}
      {commentItemId && (() => {
        const item = project.items.find(i => i.id === commentItemId)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setCommentItemId(null)} />
            <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Comment</h3>
                {item && (
                  <p className="text-xs text-slate-400">
                    #{item.rowNum} &nbsp;·&nbsp; {item.description}
                  </p>
                )}
              </div>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={5}
                placeholder="Write a comment or note about this line item…"
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
                autoFocus
              />
              <div className="flex justify-between items-center">
                {commentDraft && (
                  <button
                    onClick={() => { setCommentDraft(''); setComment(projectId, commentItemId, ''); setCommentItemId(null) }}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Remove comment
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => setCommentItemId(null)}
                    className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveComment}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Subcontractor manager */}
      {showSubManager && (
        <SubcontractorManager
          projectId={projectId}
          subcontractors={subcontractors}
          onClose={() => setShowSubManager(false)}
        />
      )}

      {/* New Walk modal */}
      {showNewWalk && (
        <NewWalkModal
          onClose={() => setShowNewWalk(false)}
          onCreate={(name) => {
            const walk = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name, createdAt: new Date().toISOString() }
            addWalk(projectId, walk)
            setActiveWalkId(walk.id)
            setActiveView('scope')
            setShowNewWalk(false)
          }}
        />
      )}

      {/* Sketch viewer */}
      {showSketchViewer && (project.sketches?.length ?? 0) > 0 && (
        <SketchViewer
          sketches={project.sketches!}
          onClose={() => setShowSketchViewer(false)}
        />
      )}

      {/* Sketch upload modal */}
      {showSketchUpload && (() => {
        const sketches = project.sketches ?? []
        const usedLabels = new Set(sketches.map(s => s.label))
        const availableLabels = SKETCH_LABELS.filter(l => !usedLabels.has(l))
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowSketchUpload(false)} />
            <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Project Sketches</h3>
                <p className="text-xs text-slate-400 mt-0.5">Upload up to 3 PDF sketches. Each must have a unique level name.</p>
              </div>

              {/* Already uploaded */}
              {sketches.length > 0 && (
                <div className="flex flex-col gap-2">
                  {SKETCH_LABELS.filter(l => usedLabels.has(l)).map(label => {
                    const sk = sketches.find(s => s.label === label)!
                    return (
                      <div key={label} className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                        <div>
                          <p className="text-xs font-medium text-slate-700">{label}</p>
                          <p className="text-[10px] text-slate-400">{sk.fileName}</p>
                        </div>
                        <button
                          onClick={() => removeSketch(project.id, label)}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                          title="Remove sketch"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Upload new */}
              {availableLabels.length > 0 ? (
                <div className="flex items-center gap-3">
                  <select
                    value={sketchLabel}
                    onChange={e => setSketchLabel(e.target.value as SketchLabel)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
                  >
                    {availableLabels.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <button
                    onClick={() => sketchUploadRef.current?.click()}
                    disabled={sketchUploading}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {sketchUploading ? 'Uploading…' : 'Upload PDF'}
                  </button>
                  <input
                    ref={sketchUploadRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setSketchUploading(true)
                      const reader = new FileReader()
                      reader.onload = ev => {
                        const data = ev.target?.result as string
                        addSketch(project.id, { label: sketchLabel, data, fileName: file.name })
                        setSketchUploading(false)
                        const remaining = availableLabels.filter(l => l !== sketchLabel)
                        if (remaining.length > 0) setSketchLabel(remaining[0])
                      }
                      reader.readAsDataURL(file)
                      e.target.value = ''
                    }}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-400">All 3 sketch slots are filled.</p>
              )}

              <div className="flex justify-between items-center pt-1">
                <button
                  onClick={() => setShowSketchUpload(false)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
                {sketches.length > 0 && (
                  <button
                    onClick={() => { setShowSketchUpload(false); setShowSketchViewer(true) }}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    View Sketches
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
