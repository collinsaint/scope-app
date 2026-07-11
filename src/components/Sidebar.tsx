import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useViewMode } from '../hooks/useViewMode'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'user-settings' | 'admin-portal'

interface Props {
  view: AppView
  onNavigate: (view: AppView, projectId?: string) => void
  onSignOut?: () => void
  userEmail?: string
  isAppAdmin?: boolean
  isContractorAdmin?: boolean
}

const FULL_WIDTH = 224
const STRIP_WIDTH = 16

export function Sidebar({ view, onNavigate, onSignOut, userEmail, isAppAdmin, isContractorAdmin }: Props) {
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
        className="absolute inset-y-0 left-0 flex flex-col transition-transform duration-300 ease-in-out"
        style={{
          width: `${FULL_WIDTH}px`,
          background: '#0D0B21',
          transform: collapsed ? `translateX(-${FULL_WIDTH - STRIP_WIDTH}px)` : 'translateX(0)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.07] flex-shrink-0">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 36 36" role="img" aria-label="Verascope">
              <circle cx="18" cy="18" r="9" fill="none" stroke="#EEEDFE" strokeWidth="2.4"/>
              <circle cx="18" cy="18" r="3" fill="#EEEDFE"/>
            </svg>
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight">Verascope</span>
        </div>

        {/* Nav */}
        <nav className="px-2.5 pt-3 pb-2 space-y-0.5 flex-shrink-0">
          <button
            onClick={() => onNavigate('dashboard')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              view === 'dashboard'
                ? 'bg-white/10 text-white font-medium'
                : 'text-white/40 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </button>
          {isContractorAdmin && (
            <button
              onClick={() => onNavigate('contractor-settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                view === 'contractor-settings'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/40 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
              Contractor Settings
            </button>
          )}
          <button
            onClick={() => onNavigate('user-settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              view === 'user-settings'
                ? 'bg-white/10 text-white font-medium'
                : 'text-white/40 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            User Settings
          </button>
          {isAppAdmin && (
            <button
              onClick={() => onNavigate('admin-portal')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                view === 'admin-portal'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/40 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Admin Portal
            </button>
          )}
        </nav>

        {/* Projects */}
        <div className="px-2.5 flex-1 overflow-y-auto">
          <p className="px-3 py-2 text-[10.5px] text-white/30 uppercase tracking-widest font-medium">
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
                      ? 'bg-white/10 text-white'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pct === 100 ? 'bg-green-400' : pct > 0 ? 'bg-blue-400' : 'bg-white/20'}`} />
                  <span className="text-[12.5px] truncate flex-1 min-w-0">{p.name}</span>
                  {p.isDemo && (
                    <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 tracking-wide">DEMO</span>
                  )}
                </button>
              )
            })}
            <button
              onClick={() => onNavigate('dashboard')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/25 hover:text-white/50 text-[12.5px] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New project
            </button>
          </div>
        </div>

        {/* User / sign out */}
        {onSignOut && (
          <div className={`flex-shrink-0 px-2.5 pb-1 transition-opacity duration-300 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-5 h-5 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </div>
              <span className="text-[11px] text-white/40 truncate flex-1 min-w-0">{userEmail}</span>
              <button onClick={onSignOut} title="Sign out" className="flex-shrink-0 text-white/30 hover:text-red-400 transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Mode toggle */}
        <div className={`flex-shrink-0 px-2.5 pb-1 transition-opacity duration-300 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <button
            onClick={toggle}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            Switch to Mobile View
          </button>
        </div>

        {/* Hide button */}
        <div className={`flex-shrink-0 border-t border-white/[0.07] flex items-center justify-center transition-opacity duration-300 ${collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ height: '44px' }}>
          <button
            onClick={() => setCollapsed(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span className="text-[12px] font-medium">Hide</span>
          </button>
        </div>

        {/* Restore button */}
        <button
          onClick={() => setCollapsed(false)}
          title="Show sidebar"
          className={`absolute bottom-0 right-0 flex items-center justify-center hover:bg-white/[0.08] transition-all duration-300 ${
            collapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ width: `${STRIP_WIDTH}px`, height: '44px' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </aside>
    </div>
  )
}
