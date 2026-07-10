import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useViewMode } from '../hooks/useViewMode'
import { NewProjectModal } from './NewProjectModal'
import type { Project } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

interface Props {
  onOpenProject: (id: string) => void
  onOpenProjectDetails: (id: string) => void
}

export function Dashboard({ onOpenProject, onOpenProjectDetails }: Props) {
  const { projects, deleteProject } = useStore()
  const { isMobile } = useViewMode()
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterJobGroup, setFilterJobGroup] = useState('')
  const [filterSuperintendent, setFilterSuperintendent] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

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
  })

  function clearFilters() {
    setFilterJobGroup('')
    setFilterSuperintendent('')
    setFilterStatus('')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Mobile top ribbon */}
      {isMobile && (
        <div
          className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
          style={{ background: '#3C3489', borderBottom: '1px solid rgba(175,169,236,0.25)' }}
        >
          <svg width="32" height="32" viewBox="0 0 36 36" role="img" aria-label="Verascope">
            <circle cx="18" cy="18" r="9.5" fill="none" stroke="#AFA9EC" strokeWidth="4" />
            <circle cx="18" cy="18" r="2.2" fill="#EEEDFE" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-white leading-none tracking-tight">Verascope</p>
            <p className="text-[10px] leading-none mt-1" style={{ color: '#AFA9EC' }}>Every item, verified</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {filtered.length !== projects.length
              ? `${filtered.length} of ${projects.length} project${projects.length !== 1 ? 's' : ''}`
              : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New project
        </button>
      </div>

      {/* Search + Filter bar */}
      {projects.length > 0 && (
        <div className="mb-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors flex-shrink-0 ${
                showFilters || activeFilterCount > 0
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              Filter
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter dropdowns */}
          {showFilters && (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <select
                value={filterJobGroup}
                onChange={e => setFilterJobGroup(e.target.value)}
                className={`text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${filterJobGroup ? 'border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'}`}
              >
                <option value="">All Job Groups</option>
                {jobGroupOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>

              <select
                value={filterSuperintendent}
                onChange={e => setFilterSuperintendent(e.target.value)}
                className={`text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${filterSuperintendent ? 'border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'}`}
              >
                <option value="">All Superintendents</option>
                {superintendentOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className={`text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${filterStatus ? 'border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'}`}
              >
                <option value="">All Statuses</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-slate-500 hover:text-red-500 px-2 py-1.5 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <h2 className="text-base font-medium text-slate-700 mb-1">No projects yet</h2>
          <p className="text-sm text-slate-400 mb-6">Create your first project and upload an Xactimate scope of work.</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Create project
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <h2 className="text-base font-medium text-slate-700 mb-1">No projects match</h2>
          <p className="text-sm text-slate-400 mb-4">Try adjusting your search or filters.</p>
          <button
            onClick={() => { setSearch(''); clearFilters() }}
            className="text-sm text-blue-600 font-medium hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={onOpenProject} onOpenDetails={onOpenProjectDetails} onDelete={deleteProject} />
          ))}
          <button
            onClick={() => setShowModal(true)}
            className="h-full min-h-[160px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span className="text-sm font-medium">New project</span>
          </button>
        </div>
      )}

      {showModal && <NewProjectModal onClose={() => setShowModal(false)} onCreated={onOpenProject} />}
      </div>
    </div>
  )
}

function ProjectCard({ project, onOpen, onOpenDetails, onDelete }: { project: Project; onOpen: (id: string) => void; onOpenDetails: (id: string) => void; onDelete: (id: string) => void }) {
  const completed = project.items.filter(i => i.completed).length
  const total = project.items.length
  const pct = total ? Math.round(completed / total * 100) : 0
  const totalRcv = project.items.reduce((s, i) => s + i.rcv, 0)
  const completedRcv = project.items.filter(i => i.completed).reduce((s, i) => s + i.rcv, 0)

  const statusColors: Record<string, string> = {
    'Active': 'bg-green-100 text-green-700',
    'On Hold': 'bg-yellow-100 text-yellow-700',
    'Completed': 'bg-blue-100 text-blue-700',
    'Cancelled': 'bg-red-100 text-red-600',
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-slate-900 truncate">{project.name}</h3>
            {project.isDemo && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 tracking-wide uppercase">Demo</span>
            )}
            {project.projectStatus && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[project.projectStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                {project.projectStatus}
              </span>
            )}
          </div>
          {project.address && <p className="text-xs text-slate-400 mt-0.5 truncate">{project.address}</p>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm('Delete this project?')) onDelete(project.id) }}
          className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 p-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>

      {/* Project Info fields */}
      {(project.projectCode || project.jobGroup || project.superintendent) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {project.projectCode && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Project ID</p>
              <p className="text-xs font-medium text-slate-700 truncate">{project.projectCode}</p>
            </div>
          )}
          {project.jobGroup && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Job Group</p>
              <p className="text-xs font-medium text-slate-700 truncate">{project.jobGroup}</p>
            </div>
          )}
          {project.superintendent && (
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Superintendent</p>
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
          <p className="text-[11px] text-slate-400 mb-0.5">Completed Amount</p>
          <p className="text-sm font-semibold text-green-600">{fmt(completedRcv)}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">{completed}/{total} items</span>
          <span className="text-xs font-medium text-slate-600">{pct}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onOpen(project.id)}
          className="w-full py-2 text-sm text-blue-600 font-medium bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          View scope
        </button>
        <button
          onClick={() => onOpenDetails(project.id)}
          className="w-full py-2 text-sm text-blue-600 font-medium bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          Project details
        </button>
      </div>
    </div>
  )
}
