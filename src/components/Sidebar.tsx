import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useViewMode } from '../hooks/useViewMode'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'user-settings'

interface Props {
  view: AppView
  onNavigate: (view: AppView, projectId?: string) => void
}

const FULL_WIDTH = 224
const STRIP_WIDTH = 16

export function Sidebar({ view, onNavigate }: Props) {
  const { projects, activeProjectId } = useStore()
  const { isMobile, toggle } = useViewMode()
  const [collapsed, setCollapsed] = useState(false)

  if (isMobile) return null

  return (
    <div
      className="relative flex-shrink-0 h-full overflow-hidden transition-[width] duration-300 ease-in-out"
      style={{ width: collapsed ? `${STRIP_WIDTH}px` : `${FULL_WIDTH}px` }}
    >
      <aside
        className="absolute inset-y-0 left-0 bg-slate-900 flex flex-col transition-transform duration-300 ease-in-out"
        style={{
          width: `${FULL_WIDTH}px`,
          transform: collapsed ? `translateX(-${FULL_WIDTH - STRIP_WIDTH}px)` : 'translateX(0)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-700/60 flex-shrink-0">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <span className="text-slate-100 font-semibold text-[15px] tracking-tight">ProScope</span>
        </div>

        {/* Nav */}
        <nav className="px-2.5 pt-3 pb-2 space-y-0.5 flex-shrink-0">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              view === 'dashboard'
                ? 'bg-blue-600/20 text-blue-300'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </button>
          <button
            onClick={() => onNavigate('contractor-settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              view === 'contractor-settings'
                ? 'bg-blue-600/20 text-blue-300'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            Contractor Settings
          </button>
          <button
            onClick={() => onNavigate('user-settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              view === 'user-settings'
                ? 'bg-blue-600/20 text-blue-300'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            User Settings
          </button>
        </nav>

        {/* Projects */}
        <div className="px-2.5 flex-1 overflow-y-auto">
          <p className="px-3 py-2 text-[10.5px] text-slate-500 uppercase tracking-widest font-medium">
            Projects
          </p>
          <div className="space-y-0.5">
            {projects.map((p) => {
              const completed = p.items.filter(i => i.completed).length
              const pct = p.items.length ? Math.round(completed / p.items.length * 100) : 0
              const isActive = view === 'project' && activeProjectId === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => onNavigate('project', p.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pct === 100 ? 'bg-green-400' : pct > 0 ? 'bg-blue-400' : 'bg-slate-500'}`} />
                  <span className="text-[12.5px] truncate flex-1 min-w-0">{p.name}</span>
                  {p.isDemo && (
                    <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 tracking-wide">DEMO</span>
                  )}
                </button>
              )
            })}
            <button
              onClick={() => onNavigate('dashboard')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:text-slate-300 text-[12.5px] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New project
            </button>
          </div>
        </div>

        {/* Mode toggle */}
        <div className={`flex-shrink-0 px-2.5 pb-1 transition-opacity duration-300 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <button
            onClick={toggle}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            Switch to Mobile View
          </button>
        </div>

        {/* Hide button */}
        <div className={`flex-shrink-0 border-t border-slate-700/60 flex items-center justify-center transition-opacity duration-300 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ height: '44px' }}>
          <button
            onClick={() => setCollapsed(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span className="text-[12px] font-medium">Hide</span>
          </button>
        </div>

        {/* Restore button — same bottom position, visible only when collapsed */}
        <button
          onClick={() => setCollapsed(false)}
          title="Show sidebar"
          className={`absolute bottom-0 right-0 flex items-center justify-center hover:bg-slate-800 transition-all duration-300 ${
            collapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ width: `${STRIP_WIDTH}px`, height: '44px' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </aside>
    </div>
  )
}
