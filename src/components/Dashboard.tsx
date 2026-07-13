import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useViewMode } from '../hooks/useViewMode'
import { NewProjectModal } from './NewProjectModal'
import type { Project, ScopeItem } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

interface Props {
  onOpenProject: (id: string) => void
  onOpenProjectDetails: (id: string) => void
  onOpenProjectFinancials?: (id: string) => void
  isAppAdmin?: boolean
  onNavigateAdmin?: () => void
  isSuperintendent?: boolean
  isSuperintendentRole?: boolean
  isSubUser?: boolean
  superintendentUserId?: string | null
  superintendentName?: string | null
  currentUserName?: string
  isContractorAdmin?: boolean
}

const statusConfig: Record<string, { dot: string; pill: string }> = {
  'Site Visit':       { dot: 'bg-blue-400',    pill: 'bg-blue-50 border-blue-200 text-blue-700' },
  'Pre-Construction': { dot: 'bg-amber-400',   pill: 'bg-amber-50 border-amber-200 text-amber-700' },
  'Work in Progress': { dot: 'bg-violet-400',  pill: 'bg-violet-50 border-violet-200 text-violet-700' },
  'Warranty':         { dot: 'bg-emerald-400', pill: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  'Closed':           { dot: 'bg-slate-300',   pill: 'bg-slate-50 border-slate-200 text-slate-600' },
}

interface PendingItemDetail {
  item: ScopeItem
  project: Project
}

export function Dashboard({ onOpenProject, onOpenProjectDetails, onOpenProjectFinancials, isAppAdmin, onNavigateAdmin, isSuperintendentRole = false, superintendentUserId, superintendentName, currentUserName, isContractorAdmin = false }: Props) {
  const { projects: allProjects, deleteProject, approveItem, returnItem, bulkApproveItems } = useStore()
  const { isMobile } = useViewMode()
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterJobGroup, setFilterJobGroup] = useState('')
  const [filterSuperintendent, setFilterSuperintendent] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [expandedApprovalIds, setExpandedApprovalIds] = useState<Set<string>>(new Set())
  const [itemDetail, setItemDetail] = useState<PendingItemDetail | null>(null)
  const [detailComment, setDetailComment] = useState('')
  const [approveConfirming, setApproveConfirming] = useState(false)
  const [bulkConfirmProject, setBulkConfirmProject] = useState<{ id: string; count: number; itemIds: string[] } | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')

  const projects = (() => {
    if (!superintendentUserId) return allProjects
    const nameLower = superintendentName?.trim().toLowerCase()
    const matched = allProjects.filter(p =>
      p.isDemo ||
      p.superintendentId === superintendentUserId ||
      (nameLower && p.superintendent?.trim().toLowerCase() === nameLower)
    )
    return matched.length > 0 ? matched : allProjects
  })()

  const jobGroupOptions = [...new Set(projects.map(p => p.jobGroup).filter(Boolean))] as string[]
  const superintendentOptions = [...new Set(projects.map(p => p.superintendent).filter(Boolean))] as string[]
  const statusOptions = [...new Set(projects.map(p => p.projectStatus).filter(Boolean))] as string[]

  const activeFilterCount = [filterJobGroup, filterSuperintendent, filterStatus].filter(Boolean).length

  const filtered = projects.filter(p => {
    if (search) {
      const q = search.toLowerCase()
      if (!p.name.toLowerCase().includes(q) && !(p.address ?? '').toLowerCase().includes(q) && !(p.projectCode ?? '').toLowerCase().includes(q)) return false
    }
    if (filterJobGroup && p.jobGroup !== filterJobGroup) return false
    if (filterSuperintendent && p.superintendent !== filterSuperintendent) return false
    if (filterStatus && p.projectStatus !== filterStatus) return false
    return true
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  function clearFilters() {
    setFilterJobGroup('')
    setFilterSuperintendent('')
    setFilterStatus('')
  }

  // Pending approval queue — only for superintendent role users
  const pendingByProject = isSuperintendentRole
    ? projects
        .map(p => ({
          project: p,
          items: p.items.filter(i => !i.isHeader && i.pendingApproval),
        }))
        .filter(x => x.items.length > 0)
    : []
  const totalPending = pendingByProject.reduce((s, x) => s + x.items.length, 0)

  function toggleProject(id: string) {
    setExpandedApprovalIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Mobile top ribbon */}
      {isMobile && (
        <div
          className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
          style={{ background: '#0D0B21', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <svg width="32" height="32" viewBox="0 0 36 36" role="img" aria-label="Verascope">
            <circle cx="18" cy="18" r="9.5" fill="none" stroke="#AFA9EC" strokeWidth="4" />
            <circle cx="18" cy="18" r="2.2" fill="#EEEDFE" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-white leading-none tracking-tight">Verascope</p>
            <p className="text-[10px] leading-none mt-1" style={{ color: '#AFA9EC' }}>Every item, verified</p>
          </div>
          {isAppAdmin && onNavigateAdmin && (
            <button
              onClick={onNavigateAdmin}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.08] text-white/60 hover:bg-white/[0.14] hover:text-white transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Admin Portal
            </button>
          )}
        </div>
      )}

      {/* Desktop page header */}
      {!isMobile && (
        <div className="page-header">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">
              {filtered.length !== projects.length
                ? `${filtered.length} of ${projects.length} project${projects.length !== 1 ? 's' : ''}`
                : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {(isContractorAdmin || isAppAdmin) && (
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New project
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* Mobile header */}
        {isMobile && (
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Projects</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {filtered.length !== projects.length
                  ? `${filtered.length} of ${projects.length}`
                  : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            {(isContractorAdmin || isAppAdmin) && (
              <button onClick={() => setShowModal(true)} className="btn-primary btn-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New
              </button>
            )}
          </div>
        )}

        {/* Search + Filter bar */}
        {projects.length > 0 && (
          <div className="mb-5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="input-base pl-9 pr-8"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowFilters(v => !v)}
                className={`btn-ghost flex-shrink-0 border ${
                  showFilters || activeFilterCount > 0
                    ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-50'
                    : 'border-slate-200'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                Filter
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Card / List toggle */}
              <div className="flex items-center flex-shrink-0 border border-slate-200 rounded-[9px] overflow-hidden">
                <button
                  onClick={() => setViewMode('card')}
                  title="Card view"
                  className={`flex items-center justify-center w-9 h-9 transition-colors ${viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  title="List view"
                  className={`flex items-center justify-center w-9 h-9 transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-[10px]">
                <select
                  value={filterJobGroup}
                  onChange={e => setFilterJobGroup(e.target.value)}
                  className={`text-sm border rounded-[8px] px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${filterJobGroup ? 'border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                >
                  <option value="">All Job Groups</option>
                  {jobGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}
                </select>

                <select
                  value={filterSuperintendent}
                  onChange={e => setFilterSuperintendent(e.target.value)}
                  className={`text-sm border rounded-[8px] px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${filterSuperintendent ? 'border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                >
                  <option value="">All Superintendents</option>
                  {superintendentOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className={`text-sm border rounded-[8px] px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${filterStatus ? 'border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                >
                  <option value="">All Statuses</option>
                  {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-red-500 px-2 py-1.5 transition-colors">
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800 mb-1">No projects yet</h2>
            <p className="text-sm text-slate-400 mb-6 max-w-xs">Create your first project and upload an Xactimate scope of work.</p>
            {(isContractorAdmin || isAppAdmin) && (
              <button onClick={() => setShowModal(true)} className="btn-primary">
                Create project
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800 mb-1">No projects match</h2>
            <p className="text-sm text-slate-400 mb-4">Try adjusting your search or filters.</p>
            <button onClick={() => { setSearch(''); clearFilters() }} className="text-sm text-blue-600 font-medium hover:underline">
              Clear all
            </button>
          </div>
        ) : viewMode === 'list' ? (
          /* List view — table of all projects */
          <div className="section-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Project</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Total RCV</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Completed</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Progress</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(p => {
                    const totalRcv = p.items.reduce((s, i) => s + i.rcv, 0)
                    const completedRcv = p.items.filter(i => i.completed).reduce((s, i) => s + i.rcv, 0)
                    const total = p.items.length
                    const completed = p.items.filter(i => i.completed).length
                    const pending = p.items.filter(i => i.pendingApproval && !i.completed).length
                    const pctCompleted = total ? completed / total * 100 : 0
                    const pctPending = total ? pending / total * 100 : 0
                    const pct = Math.round(pctCompleted + pctPending)
                    const statusCfg = p.projectStatus ? (statusConfig[p.projectStatus] ?? { dot: 'bg-slate-300', pill: 'bg-slate-50 border-slate-200 text-slate-600' }) : null
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800 leading-tight">{p.name}</p>
                          {p.address && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{p.address}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {statusCfg ? (
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.pill}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                              {p.projectStatus}
                            </span>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700 text-right tabular-nums">{fmt(totalRcv)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-600 text-right tabular-nums">{fmt(completedRcv)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                              <div className="h-full bg-green-500" style={{ width: `${pctCompleted}%` }} />
                              <div className="h-full bg-amber-400" style={{ width: `${pctPending}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 w-8">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => onOpenProject(p.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">Scope</button>
                            <button onClick={() => onOpenProjectDetails(p.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Details</button>
                            {onOpenProjectFinancials && <button onClick={() => onOpenProjectFinancials(p.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Financials</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Horizontal-scroll slider — full-width cards on mobile, fixed-width on desktop */
          <div className="overflow-x-auto -mx-6 px-6 pb-3 snap-x snap-mandatory">
            <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
              {filtered.map((p) => (
                <div key={p.id} className={`flex-shrink-0 snap-center ${isMobile ? 'w-[calc(100vw-48px)]' : 'w-72'}`}>
                  <ProjectCard project={p} onOpen={onOpenProject} onOpenDetails={onOpenProjectDetails} onOpenFinancials={onOpenProjectFinancials} onDelete={deleteProject} canDelete={isContractorAdmin || isAppAdmin} />
                </div>
              ))}
              {(isContractorAdmin || isAppAdmin) && (
                <div className={`flex-shrink-0 snap-center ${isMobile ? 'w-[calc(100vw-48px)]' : 'w-72'}`}>
                  <button
                    onClick={() => setShowModal(true)}
                    className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-[14px] text-slate-400 hover:border-blue-400/60 hover:bg-blue-50/40 hover:text-blue-500 transition-all duration-150"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    <span className="text-sm font-medium">New project</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pending Approvals — superintendent role only, shown below project cards */}
        {isSuperintendentRole && pendingByProject.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Pending Approvals</h2>
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                {totalPending}
              </span>
            </div>
            <div className="section-card overflow-hidden divide-y divide-slate-100">
              {pendingByProject.map(({ project, items: pending }) => {
                const isExpanded = expandedApprovalIds.has(project.id)
                return (
                  <div key={project.id}>
                    <div
                      onClick={() => toggleProject(project.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <svg
                          width="14" height="14"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`flex-shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                        <span className="text-sm font-semibold text-slate-800 truncate">{project.name}</span>
                        {project.address && (
                          <span className="text-xs text-slate-400 truncate hidden sm:block">{project.address}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          {pending.length} pending
                        </span>
                        {isExpanded && (
                          <button
                            onClick={e => { e.stopPropagation(); setBulkConfirmProject({ id: project.id, count: pending.length, itemIds: pending.map(i => i.id) }) }}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors"
                          >
                            Approve All
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); onOpenProject(project.id) }}
                          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          Open
                        </button>
                      </div>
                    </div>

                    {isExpanded && (() => {
                      // Group pending items by room, preserving original order
                      const roomOrder: string[] = []
                      const byRoom: Record<string, typeof pending> = {}
                      for (const item of pending) {
                        if (!byRoom[item.room]) { byRoom[item.room] = []; roomOrder.push(item.room) }
                        byRoom[item.room].push(item)
                      }
                      return (
                        <div className="bg-slate-50/60">
                          {roomOrder.map((room, roomIdx) => (
                            <div key={`${room}-${roomIdx}`}>
                              <div className="px-4 py-1.5 pl-10 bg-slate-100/70 border-y border-slate-100">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{room}</span>
                              </div>
                              {byRoom[room].map(item => (
                                <button
                                  key={item.id}
                                  onClick={() => { setItemDetail({ item, project }); setDetailComment('') }}
                                  className="w-full flex items-center gap-3 px-4 py-3 pl-10 hover:bg-slate-100/80 transition-colors text-left border-b border-slate-100 last:border-0"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-slate-800 leading-snug">{item.description}</p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">#{item.rowNum}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {item.photos.length > 0 && (
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                                        <polyline points="21 15 16 10 5 21"/>
                                      </svg>
                                    )}
                                    {(item.comment || (item.commentNotes?.length ?? 0) > 0) && (
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                                      </svg>
                                    )}
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="9 18 15 12 9 6"/>
                                    </svg>
                                  </div>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {showModal && <NewProjectModal onClose={() => setShowModal(false)} onCreated={onOpenProjectDetails} />}
      </div>

      {/* Item detail popup */}
      {itemDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setItemDetail(null); setDetailComment(''); setApproveConfirming(false) }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-1">{itemDetail.project.name}</p>
                <p className="text-sm font-semibold text-slate-800 leading-snug">{itemDetail.item.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{itemDetail.item.room}</span>
                  <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">#{itemDetail.item.rowNum}</span>
                  {itemDetail.item.activity && <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{itemDetail.item.activity}</span>}
                  {itemDetail.item.coverage && <span className="text-[11px] bg-violet-50 text-violet-600 px-2 py-0.5 rounded-md">{itemDetail.item.coverage}</span>}
                  {itemDetail.item.rcv > 0 && <span className="text-[11px] bg-green-50 text-green-700 px-2 py-0.5 rounded-md font-semibold">{fmt(itemDetail.item.rcv)}</span>}
                </div>
              </div>
              <button onClick={() => { setItemDetail(null); setDetailComment(''); setApproveConfirming(false) }} className="p-1.5 ml-3 rounded-lg text-slate-400 hover:bg-slate-100 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {itemDetail.item.note && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/>
                  </svg>
                  <p className="text-xs text-amber-800 leading-relaxed">{itemDetail.item.note}</p>
                </div>
              )}
              {itemDetail.item.photos.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Photos ({itemDetail.item.photos.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {itemDetail.item.photos.map((src, i) => (
                      <img key={i} src={src} alt="" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
                    ))}
                  </div>
                </div>
              )}
              {(itemDetail.item.comment || (itemDetail.item.commentNotes?.length ?? 0) > 0) && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Comments</p>
                  {itemDetail.item.comment && (
                    <p className="text-sm text-slate-700 bg-blue-50 px-3 py-2 rounded-lg leading-relaxed">{itemDetail.item.comment}</p>
                  )}
                  {(itemDetail.item.commentNotes ?? []).map((note, i) => (
                    <div key={i} className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                      {note.type && (
                        <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mb-1 ${
                          note.type === 'approval' ? 'bg-green-100 text-green-700' :
                          note.type === 'return' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {note.type === 'approval' ? 'Approved' : note.type === 'return' ? 'Returned' : 'Comment'}
                        </span>
                      )}
                      <p className="text-xs text-slate-700 leading-relaxed">{note.text}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {note.by && <span className="font-medium text-slate-500">{note.by} · </span>}
                        {fmtDate(note.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {isSuperintendentRole && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Decision Comment (optional)</label>
                  <textarea
                    value={detailComment}
                    onChange={e => setDetailComment(e.target.value)}
                    placeholder="Add a note about your decision…"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    rows={2}
                  />
                </div>
              )}
            </div>
            {isSuperintendentRole && (
              <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
                {approveConfirming ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-center text-slate-600 font-medium">Confirm approval of this item?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setApproveConfirming(false)}
                        className="flex-1 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          approveItem(itemDetail.project.id, itemDetail.item.id, detailComment, currentUserName)
                          setItemDetail(null)
                          setDetailComment('')
                          setApproveConfirming(false)
                        }}
                        className="flex-1 py-2 text-sm font-semibold text-white rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
                      >
                        Yes, Approve
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        returnItem(itemDetail.project.id, itemDetail.item.id, detailComment, currentUserName)
                        setItemDetail(null)
                        setDetailComment('')
                      }}
                      className="flex-1 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Return
                    </button>
                    <button
                      onClick={() => setApproveConfirming(true)}
                      className="flex-1 py-2 text-sm font-semibold text-white rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
                    >
                      Approve
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk approve confirmation modal */}
      {bulkConfirmProject && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBulkConfirmProject(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-auto p-6 flex flex-col gap-4">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-11 h-11 rounded-full bg-green-50 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-800">Approve all {bulkConfirmProject.count} items?</p>
              <p className="text-xs text-slate-500">This will mark all pending items in this project as approved and completed. This cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setBulkConfirmProject(null)}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  bulkApproveItems(bulkConfirmProject.id, bulkConfirmProject.itemIds, currentUserName)
                  setBulkConfirmProject(null)
                }}
                className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl bg-green-600 hover:bg-green-700 transition-colors"
              >
                Yes, Approve All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, onOpen, onOpenDetails, onOpenFinancials, onDelete, canDelete = false }: { project: Project; onOpen: (id: string) => void; onOpenDetails: (id: string) => void; onOpenFinancials?: (id: string) => void; onDelete: (id: string) => void; canDelete?: boolean }) {
  const completed = project.items.filter(i => i.completed).length
  const total = project.items.length
  const pending = project.items.filter(i => i.pendingApproval && !i.completed).length
  const pctCompleted = total ? project.items.filter(i => i.completed).length / total * 100 : 0
  const pctPending = total ? pending / total * 100 : 0
  const pct = Math.round(pctCompleted + pctPending)
  const totalRcv = project.items.reduce((s, i) => s + i.rcv, 0)
  const completedRcv = project.items.filter(i => i.completed).reduce((s, i) => s + i.rcv, 0)

  const statusCfg = project.projectStatus
    ? (statusConfig[project.projectStatus] ?? { dot: 'bg-slate-300', pill: 'bg-slate-50 border-slate-200 text-slate-600' })
    : null

  return (
    <div className="card card-hover p-5 flex flex-col gap-4 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900 truncate tracking-tight">{project.name}</h3>
            {project.isDemo && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 tracking-wide uppercase">Demo</span>
            )}
            {statusCfg && (
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusCfg.pill}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                {project.projectStatus}
              </span>
            )}
          </div>
          {project.address && <p className="text-xs text-slate-400 mt-0.5 truncate">{project.address}</p>}
        </div>
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this project?')) onDelete(project.id) }}
            className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        )}
      </div>

      {(project.projectCode || project.jobGroup || project.superintendent) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {project.projectCode && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Project ID</p>
              <p className="text-xs font-medium text-slate-700 truncate">{project.projectCode}</p>
            </div>
          )}
          {project.jobGroup && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Job Group</p>
              <p className="text-xs font-medium text-slate-700 truncate">{project.jobGroup}</p>
            </div>
          )}
          {project.superintendent && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Superintendent</p>
              <p className="text-xs font-medium text-slate-700 truncate">{project.superintendent}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">Total Amount</p>
          <p className="text-sm font-semibold text-slate-800">{fmt(totalRcv)}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-0.5">Completed</p>
          <p className="text-sm font-semibold text-emerald-600">{fmt(completedRcv)}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">{completed}/{total} items</span>
          <span className="text-xs font-semibold text-slate-600">{pct}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${pctCompleted}%` }} />
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${pctPending}%` }} />
        </div>
      </div>

      <div className="flex gap-2 mt-auto">
        <button onClick={() => onOpen(project.id)} className="btn-secondary flex-1 justify-center text-xs">
          Scope
        </button>
        <button onClick={() => onOpenDetails(project.id)} className="btn-ghost flex-1 justify-center text-xs border border-slate-200">
          Details
        </button>
        {onOpenFinancials && (
          <button onClick={() => onOpenFinancials(project.id)} className="btn-ghost flex-1 justify-center text-xs border border-slate-200">
            Financials
          </button>
        )}
      </div>
    </div>
  )
}
