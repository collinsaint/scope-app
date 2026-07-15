import { useState, useCallback, useEffect, useRef } from 'react'
import { useViewMode } from '../hooks/useViewMode'
import { useDropzone } from 'react-dropzone'
import { useStore } from '../store/useStore'
import { SKETCH_LABELS } from '../types'
import type { SketchLabel, PurchaseOrder } from '../types'
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
import { CreatePOModal } from './CreatePOModal'
import { fetchPurchaseOrders, fetchMyContractorSubOrgs } from '../lib/supabaseSync'
import type { SubOrg } from '../lib/supabaseSync'

const ROOM_SUGGESTIONS = [
  'Bedroom 1','Bedroom 2','Bedroom 3','Bedroom 4','Bedroom 5',
  'Bathroom 1','Bathroom 2','Bathroom 3','Bathroom 4',
  'Kitchen','Living Room','Dining Room','Family Room','Great Room',
  'Foyer','Entry','Laundry Room','Mud Room','Utility Room',
  'HVAC','HVAC Closet','Storage Room',
  'Closet 1','Closet 2','Closet 3','Closet 4',
  'Pantry','Hallway','Hallway 2','Hallway 3',
  'Stairway','Staircase','Loft','Office','Den','Study','Library',
  'Sunroom','Florida Room','Breakfast Nook',
  'Game Room','Playroom','Nursery','Guest Room',
  'Basement','Attic','Roof','Garage','Carport','Driveway',
  'Front Porch','Rear Porch','Lanai','Deck','Patio','Balcony',
  'Front Elevation','Rear Elevation','Right Elevation','Left Elevation',
  'Pool Area',
]

interface Props {
  projectId: string
  onBack: () => void
  initialView?: 'scope' | 'comments' | 'details'
  onSubViewChange?: (view: 'scope' | 'details' | 'comments') => void
  canManageProjectSubs?: boolean
  isContractorAdmin?: boolean
  isSubUser?: boolean
  canApprove?: boolean
  subOrgName?: string
  contractorOrgId?: string | null
  currentUserName?: string
}

export function ProjectView({ projectId, onBack, initialView = 'scope', onSubViewChange, canManageProjectSubs = false, isContractorAdmin = false, isSubUser = false, canApprove = true, subOrgName, contractorOrgId, currentUserName }: Props) {
  const { isMobile } = useViewMode()
  const { projects, updateProjectItems, addWalk, addSketch, removeSketch, addWalkCustomRoom, addCommentNote, deleteCommentNote } = useStore()
  const project = projects.find(p => p.id === projectId)
  const [roomFilter, setRoomFilter] = useState('all')
  const [reuploadError, setReuploadError] = useState('')
  const [showSubManager, setShowSubManager] = useState(false)
  const [activeView, setActiveView] = useState<'scope' | 'comments' | 'details'>(initialView)
  const [commentItemId, setCommentItemId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentDeleteConfirm, setCommentDeleteConfirm] = useState<number | null>(null)
  const [showSketchViewer, setShowSketchViewer] = useState(false)
  const [showSketchUpload, setShowSketchUpload] = useState(false)
  const [sketchUploading, setSketchUploading] = useState(false)
  const [sketchLabel, setSketchLabel] = useState<SketchLabel>(SKETCH_LABELS[0])
  const sketchUploadRef = useRef<HTMLInputElement>(null)
  const [showNewWalk, setShowNewWalk] = useState(false)
  const [showWalkBar, setShowWalkBar] = useState(false)
  const [showTotals, setShowTotals] = useState(false)
  const [addRoomName, setAddRoomName] = useState<string | null>(null)
  const [showCreatePO, setShowCreatePO] = useState(false)
  const [pendingPoItemIds, setPendingPoItemIds] = useState<Set<string>>(new Set())
  const [existingPOs, setExistingPOs] = useState<PurchaseOrder[]>([])
  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([])
  const [activeWalkId, setActiveWalkId] = useState<string | null>(() => {
    if (isSubUser) return null
    const proj = useStore.getState().projects.find(p => p.id === projectId)
    if (proj?.projectStatus === 'Site Visit' && proj.walks?.length) {
      return proj.walks[0].id
    }
    return null
  })

  // Auto-select the first walk when one is created (e.g. after Site Visit SOW upload).
  // Only applies to Site Visit projects — other statuses default to scope view.
  useEffect(() => {
    if (activeWalkId || isSubUser) return
    const walks = project?.walks ?? []
    if (project?.projectStatus === 'Site Visit' && walks.length > 0) setActiveWalkId(walks[0].id)
  }, [project?.walks?.length, project?.projectStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync activeView when the parent requests a specific view (e.g. mobile nav buttons)
  useEffect(() => { setActiveView(initialView) }, [initialView])
  // Notify parent whenever subview changes (used by MobileNav for active state)
  useEffect(() => { onSubViewChange?.(activeView) }, [activeView, onSubViewChange])

  const prevStatusRef = useRef(project?.projectStatus)
  useEffect(() => {
    if (prevStatusRef.current === 'Site Visit' && project?.projectStatus !== 'Site Visit') {
      setActiveWalkId(null)
    }
    prevStatusRef.current = project?.projectStatus
  }, [project?.projectStatus])

  // Auto-switch to walk view when walks are added to a Site Visit project after initial render
  const walksLen = project?.walks?.length ?? 0
  useEffect(() => {
    if (isSubUser) return
    if (project?.projectStatus === 'Site Visit' && walksLen > 0 && activeWalkId === null) {
      setActiveWalkId(project!.walks![0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walksLen, project?.projectStatus])

  // Load POs and sub orgs for PO creation (contractor only)
  useEffect(() => {
    if (isSubUser || !contractorOrgId) return
    fetchPurchaseOrders(projectId).then(setExistingPOs)
    fetchMyContractorSubOrgs().then(setSubOrgs)
  }, [projectId, isSubUser, contractorOrgId])

  function openComment(itemId: string) {
    setCommentDraft('')
    setCommentDeleteConfirm(null)
    setCommentItemId(itemId)
  }

  function addNote() {
    if (!commentItemId || !commentDraft.trim()) return
    addCommentNote(projectId, commentItemId, { text: commentDraft.trim(), createdAt: new Date().toISOString(), by: currentUserName })
    setCommentDraft('')
  }

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted[0] || !project) return
    setReuploadError('')
    try {
      const buffer = await accepted[0].arrayBuffer()
      const { items: incoming } = parseExcelFile(buffer)
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

  const subcontractors = project.subcontractors ?? []
  const mySubEntry = isSubUser && subOrgName
    ? subcontractors.find(s => s.name.toLowerCase() === subOrgName.toLowerCase()) ?? null
    : null
  const mySubId = mySubEntry?.id ?? null
  const subPercentage = mySubEntry?.percentage ?? 100

  // Sub users only see items assigned to them; contractors see everything
  const scopeItems = isSubUser && mySubId !== null
    ? project.items.filter(i => i.isHeader || i.subcontractorId === mySubId)
    : project.items

  const dataItems = scopeItems.filter(i => !i.isHeader && i.changeTag !== 'removed' && i.coverage?.toUpperCase() !== 'DRV')
  const activeWalk = (project.walks ?? []).find(w => w.id === activeWalkId)
  const baseRooms = Array.from(new Set(scopeItems.map(i => i.room)))
  const walkCustomRooms = activeWalkId ? (activeWalk?.customRooms ?? []) : []
  const rooms = ['all', ...baseRooms, ...walkCustomRooms.filter(r => !baseRooms.includes(r))]

  function roomLabel(r: string) {
    if (r === 'all') return 'All rooms'
    return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  function roomProgress(r: string) {
    const its = (r === 'all' ? scopeItems : scopeItems.filter(i => i.room === r))
      .filter(i => !i.isHeader && i.changeTag !== 'removed' && i.coverage?.toUpperCase() !== 'DRV')
    if (!its.length) return { pct: 0, pctCompleted: 0, pctPending: 0, count: 0 }
    const done = its.filter(i => i.completed).length
    const pending = its.filter(i => i.pendingApproval && !i.completed).length
    const pctCompleted = done / its.length * 100
    const pctPending = pending / its.length * 100
    return { pct: Math.round(pctCompleted + pctPending), pctCompleted, pctPending, count: its.length }
  }

  return (
    <div {...getRootProps()} className={`flex-1 flex flex-col overflow-hidden min-h-0 ${isDragActive ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
      <input {...getInputProps()} />

      {/* Header */}
      <div
        className={`flex-shrink-0 sticky top-0 z-20 ${isMobile ? '' : 'bg-white border-b border-slate-100'}`}
        style={isMobile ? { background: '#3C3489', borderBottom: '1px solid rgba(175,169,236,0.25)' } : undefined}
      >
        {/* Row 1: back + name + actions */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={() => {
              if (activeView === 'details' && initialView !== 'details') {
                setActiveView('scope')
              } else {
                onBack()
              }
            }}
            className={`transition-colors flex-shrink-0 p-1 ${isMobile ? 'hover:text-white/90' : 'text-slate-400 hover:text-slate-600'}`}
            style={isMobile ? { color: 'rgba(206,203,246,0.7)' } : undefined}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            {isMobile ? (
              <div className="flex items-center min-w-0 overflow-hidden">
                <h1 className="text-sm font-semibold text-white truncate min-w-0">{project.name}</h1>
              </div>
            ) : (
              <>
                <h1 className="text-sm font-semibold text-slate-900 truncate">{project.name}</h1>
                <p className="text-xs text-slate-400 truncate">
                  {project.address || 'No address'} &nbsp;·&nbsp; {dataItems.length} items &nbsp;·&nbsp; {project.fileName}
                </p>
              </>
            )}
          </div>

          {/* Desktop actions */}
          {!isMobile && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {reuploadError && <span className="text-xs text-red-500">{reuploadError}</span>}
              <button
                onClick={() => { setActiveView(v => v === 'details' ? 'scope' : 'details') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${activeView === 'details' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Project Info
              </button>
              {!isSubUser && (
                <>
                  <select
                    value={activeWalkId ?? ''}
                    onChange={e => { setActiveWalkId(e.target.value || null); setActiveView('scope') }}
                    className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">Scope of Work</option>
                    {(project.walks ?? []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <button onClick={() => setShowNewWalk(true)} className="flex items-center gap-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors" title="New Walk">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </>
              )}
              <button
                onClick={() => { (project.sketches?.length ?? 0) > 0 ? setShowSketchViewer(true) : (setSketchLabel(SKETCH_LABELS[0]), setShowSketchUpload(true)) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                View Sketch{(project.sketches?.length ?? 0) > 0 && <span className="ml-0.5 bg-slate-200 text-slate-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{project.sketches!.length}</span>}
              </button>
              <button
                onClick={() => setActiveView(v => v === 'comments' ? 'scope' : 'comments')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${activeView === 'comments' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                Comments{project.items.some(i => i.comment || (i.commentNotes?.length ?? 0) > 0) && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${activeView === 'comments' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>{project.items.filter(i => i.comment || (i.commentNotes?.length ?? 0) > 0).length}</span>}
              </button>
              <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Re-upload scope
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; await onDrop([f]); e.target.value = '' }} />
              </label>
              <button
                onClick={() => setShowTotals(v => !v)}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors font-semibold min-w-[90px] ${showTotals ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                title="Toggle totals"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                Totals
              </button>
              <button onClick={() => generateReport(project, { visibleItems: scopeItems.filter(i => !i.isHeader && i.changeTag !== 'removed' && i.coverage?.toUpperCase() !== 'DRV'), subPercentage: isSubUser ? subPercentage : undefined, spanishMode: project.spanishMode, translationCache: project.translationCache ?? {}, scopeTotal: isSubUser ? undefined : project.scopeTotal })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export report
              </button>
            </div>
          )}

          {/* Mobile compact actions — floor plan + walk toggle + $ + comments + export */}
          {isMobile && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Floor Plan */}
              <button
                onClick={() => { (project.sketches?.length ?? 0) > 0 ? setShowSketchViewer(true) : (setSketchLabel(SKETCH_LABELS[0]), setShowSketchUpload(true)) }}
                className="relative flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.22)', color: (project.sketches?.length ?? 0) > 0 ? '#ffffff' : 'rgba(206,203,246,0.65)' }}
                title="Floor Plan"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span className="text-[9px] font-medium leading-none whitespace-nowrap">Floor Plan</span>
                {(project.sketches?.length ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none" style={{ background: '#ffffff', color: '#3C3489' }}>{project.sketches!.length}</span>
                )}
              </button>
              {/* Walk selector */}
              {!isSubUser && (
                <button
                  onClick={() => setShowWalkBar(v => !v)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{
                    border: '1px solid rgba(255,255,255,0.22)',
                    background: showWalkBar ? 'rgba(255,255,255,0.2)' : 'transparent',
                    color: showWalkBar ? '#ffffff' : 'rgba(206,203,246,0.65)',
                  }}
                  title="Toggle walk selector"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </button>
              )}
              {/* Totals $ — same width as comments button */}
              <button
                onClick={() => setShowTotals(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors"
                style={{
                  border: '1px solid rgba(255,255,255,0.22)',
                  background: showTotals ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: showTotals ? '#ffffff' : 'rgba(206,203,246,0.65)',
                }}
                title="Toggle totals"
              >
                $
              </button>
              {/* Comments */}
              <button
                onClick={() => setActiveView(v => v === 'comments' ? 'scope' : 'comments')}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                style={{
                  border: '1px solid rgba(255,255,255,0.22)',
                  background: activeView === 'comments' ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: activeView === 'comments' ? '#ffffff' : 'rgba(206,203,246,0.65)',
                }}
                title="Comments"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </button>
              {/* Export */}
              <button
                onClick={() => generateReport(project, { visibleItems: scopeItems.filter(i => !i.isHeader && i.changeTag !== 'removed' && i.coverage?.toUpperCase() !== 'DRV'), subPercentage: isSubUser ? subPercentage : undefined, spanishMode: project.spanishMode, translationCache: project.translationCache ?? {}, scopeTotal: isSubUser ? undefined : project.scopeTotal })}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.22)' }}
                title="Export"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            </div>
          )}
        </div>

        {/* Mobile: walk + scope switcher row — toggled by hamburger */}
        {isMobile && showWalkBar && (
          <div className="flex items-center gap-2 px-4 pb-2.5">
            <select
              value={activeWalkId ?? ''}
              onChange={e => { setActiveWalkId(e.target.value || null); setActiveView('scope') }}
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg text-white focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <option value="" style={{ background: '#3C3489' }}>Scope of Work</option>
              {(project.walks ?? []).map(w => <option key={w.id} value={w.id} style={{ background: '#3C3489' }}>{w.name}</option>)}
            </select>
            <button
              onClick={() => setShowNewWalk(true)}
              className="p-2 rounded-lg text-white/70 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.2)' }}
              title="New Walk"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Summary cards — hidden by default, toggled with $ button; also hidden on details/walk view */}
      {showTotals && activeView !== 'details' && !activeWalkId && (
        <div className="bg-white border-b border-slate-100 flex-shrink-0">
          <SummaryCards
            items={
              isSubUser && mySubId
                ? dataItems.map(i => ({ ...i, rcv: i.rcv * subPercentage / 100 }))
                : project.items
            }
            scopeTotal={isSubUser ? undefined : project.scopeTotal}
          />
        </div>
      )}

      {/* Room tabs — hidden on details view */}
      {activeView !== 'details' && (
        <div className={`flex gap-2 bg-white border-b border-slate-100 flex-shrink-0 ${isMobile ? 'px-4 py-2.5 overflow-x-auto scrollbar-hide' : 'flex-wrap px-6 py-3'}`}>
          {rooms.map((r, rIdx) => {
            const { pct, pctCompleted, pctPending, count } = roomProgress(r)
            const isActive = roomFilter === r
            const isCustom = walkCustomRooms.includes(r)
            return (
              <button
                key={`${r}-${rIdx}`}
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
                  <span className="flex items-center gap-1">
                    <span className={`text-[10px] font-medium ${isActive ? 'text-slate-300' : pct === 100 ? 'text-green-500' : 'text-slate-500'}`}>
                      {pct}%
                    </span>
                    <span className={`w-8 h-1 rounded-full overflow-hidden flex ${isActive ? 'bg-white/20' : 'bg-slate-200'}`}>
                      <span className="h-full bg-green-500" style={{ width: `${pctCompleted}%` }} />
                      <span className="h-full bg-amber-400" style={{ width: `${pctPending}%` }} />
                    </span>
                  </span>
                )}
              </button>
            )
          })}
          {activeWalkId && !isMobile && (
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
      {addRoomName !== null && activeWalkId && (() => {
        const existingRoomsLower = [...baseRooms, ...walkCustomRooms].map(r => r.toLowerCase())
        const trimmed = addRoomName.trim()
        const alreadyExists = trimmed.length > 0 && existingRoomsLower.includes(trimmed.toLowerCase())
        const suggestions = trimmed.length > 0 && !alreadyExists
          ? ROOM_SUGGESTIONS.filter(s =>
              s.toLowerCase().includes(trimmed.toLowerCase()) &&
              !existingRoomsLower.includes(s.toLowerCase())
            ).slice(0, 8)
          : []

        function commitRoom(name: string) {
          if (!name.trim() || alreadyExists) return
          addWalkCustomRoom(projectId, activeWalkId!, name.trim())
          setRoomFilter(name.trim())
          setActiveView('scope')
          setAddRoomName(null)
        }

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddRoomName(null)} />
            <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm sm:mx-4 flex flex-col">
              {/* Handle bar (mobile) */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-slate-300" />
              </div>

              <div className="px-6 pt-4 pb-6 sm:pt-6 flex flex-col gap-4">
                <h3 className="text-base font-semibold text-slate-900">Add Room</h3>

                <div className="relative">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Room name</label>
                  <input
                    type="text"
                    placeholder="e.g. Garage, Basement, Hallway"
                    value={addRoomName}
                    onChange={e => setAddRoomName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRoom(addRoomName)
                      if (e.key === 'Escape') setAddRoomName(null)
                    }}
                    className={`w-full px-4 py-3.5 text-sm border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors ${
                      alreadyExists
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-slate-200 focus:border-violet-400 focus:ring-violet-400'
                    }`}
                    autoFocus
                  />
                  {alreadyExists && (
                    <p className="mt-1.5 text-xs text-red-500 font-medium">
                      "{trimmed}" already exists in this project. Please choose a different name.
                    </p>
                  )}

                  {/* Autocomplete suggestions */}
                  {suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                      {suggestions.map(s => (
                        <button
                          key={s}
                          onMouseDown={e => { e.preventDefault(); commitRoom(s) }}
                          className="w-full text-left px-4 py-3.5 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors border-b border-slate-100 last:border-b-0 active:bg-violet-100"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setAddRoomName(null)}
                    className="flex-1 py-3.5 text-sm border-2 border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!trimmed || alreadyExists}
                    onClick={() => commitRoom(addRoomName)}
                    className="flex-1 py-3.5 text-sm bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add Room
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-white flex flex-col">
        {activeView === 'scope' && activeWalkId ? (
          <WalkView
            projectId={projectId}
            walk={(project.walks ?? []).find(w => w.id === activeWalkId)!}
            items={project.documents ? (project.walkSourceItems ?? []) : project.items}
            roomFilter={roomFilter}
            onRoomDeleted={() => setRoomFilter('all')}
            onAddRoom={isMobile ? () => setAddRoomName('') : undefined}
          />
        ) : activeView === 'scope' && project.items.length === 0 ? (
          <EmptyScopeState projectId={projectId} canUpload={isContractorAdmin} />

        ) : activeView === 'scope' ? (
          <ScopeTable
            projectId={projectId}
            items={scopeItems}
            subOrgName={subOrgName}
            subcontractors={subcontractors}
            roomFilter={roomFilter}
            onOpenComment={openComment}
            isSubUser={isSubUser}
            canApprove={canApprove}
            subPercentage={isSubUser ? subPercentage : undefined}
            currentUserName={currentUserName}
            onCreatePO={!isSubUser ? (ids) => { setPendingPoItemIds(ids); setShowCreatePO(true) } : undefined}
          />
        ) : activeView === 'comments' ? (
          <CommentsView
            items={project.items}
            onEditComment={(itemId) => { openComment(itemId) }}
          />
        ) : (
          <ProjectDetailsView project={project} canManage={canManageProjectSubs} canManageDocs={isContractorAdmin} isSubUser={isSubUser} contractorOrgId={contractorOrgId} />
        )}
      </div>

      {/* Create PO modal */}
      {showCreatePO && contractorOrgId && (
        <CreatePOModal
          project={project}
          selectedItemIds={pendingPoItemIds}
          existingPOs={existingPOs}
          contractorOrgId={contractorOrgId}
          subOrgs={subOrgs}
          onClose={() => setShowCreatePO(false)}
          onCreated={(po) => {
            setExistingPOs(prev => [po, ...prev])
            setShowCreatePO(false)
            setPendingPoItemIds(new Set())
          }}
        />
      )}

      {/* Comment modal */}
      {commentItemId && (() => {
        const item = project.items.find(i => i.id === commentItemId)
        const notes = item?.commentNotes ?? []
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => { setCommentItemId(null); setCommentDraft(''); setCommentDeleteConfirm(null) }} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80dvh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
                  {item && <p className="text-xs text-slate-400 mt-0.5 truncate">#{item.rowNum} · {item.description}</p>}
                </div>
                <button onClick={() => { setCommentItemId(null); setCommentDraft(''); setCommentDeleteConfirm(null) }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 flex-shrink-0 ml-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
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
                                <button onClick={() => setCommentDeleteConfirm(null)} className="px-2.5 py-1 text-[11px] border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors">Cancel</button>
                                <button onClick={() => { deleteCommentNote(projectId, commentItemId, i); setCommentDeleteConfirm(null) }} className="px-2.5 py-1 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium">Delete</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-700 leading-snug break-words">{n.text}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                              </div>
                              <button onClick={() => setCommentDeleteConfirm(i)} className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors mt-0.5" title="Delete note">
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
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">New note</label>
                  <textarea
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Write a comment or note about this line item…"
                    value={commentDraft}
                    onChange={e => setCommentDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setCommentItemId(null); setCommentDraft(''); setCommentDeleteConfirm(null) } }}
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setCommentItemId(null); setCommentDraft(''); setCommentDeleteConfirm(null) }}
                    className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={addNote}
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
                <p className="text-xs text-slate-400 mt-0.5">Upload up to 3 PDF or image files. Each must have a unique level name.</p>
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
                    {sketchUploading ? 'Uploading…' : 'Upload File'}
                  </button>
                  <input
                    ref={sketchUploadRef}
                    type="file"
                    accept=".pdf,image/*"
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

function EmptyScopeState({ projectId, canUpload }: { projectId: string; canUpload: boolean }) {
  const { uploadProjectDocument } = useStore()
  const siteVisitRef = useRef<HTMLInputElement>(null)
  const approvedRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, designation: 'site-visit' | 'approved-sow') {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    const { items: parsedItems } = parseExcelFile(buffer)
    uploadProjectDocument(projectId, {
      id: Math.random().toString(36).slice(2, 10),
      designation,
      fileType: 'excel',
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      parsedItems,
    })
    e.target.value = ''
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8">
      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
        <svg className="text-slate-300" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">No scope uploaded yet</p>
        <p className="text-xs text-slate-400 mt-1">Upload a scope Excel file to get started.</p>
      </div>
      {canUpload && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => siteVisitRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload Site Visit SOW
          </button>
          <button
            onClick={() => approvedRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload Approved SOW
          </button>
        </div>
      )}
      <input ref={siteVisitRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e, 'site-visit')} />
      <input ref={approvedRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e, 'approved-sow')} />
    </div>
  )
}
