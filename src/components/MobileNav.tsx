import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useViewMode } from '../hooks/useViewMode'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'user-settings'

interface Props {
  view: AppView
  onNavigate: (view: AppView, projectId?: string) => void
  onOpenProjectDetails: (id: string) => void
  onOpenProjectScope?: () => void
  activeProjectSubView?: 'scope' | 'details' | 'comments'
}

export function MobileNav({ view, onNavigate, onOpenProjectDetails, onOpenProjectScope, activeProjectSubView }: Props) {
  const { projects, activeProjectId } = useStore()
  const { toggle } = useViewMode()
  const activeProject = projects.find(p => p.id === activeProjectId)
  const [showSettingsPicker, setShowSettingsPicker] = useState(false)

  const isSettings = view === 'contractor-settings' || view === 'user-settings'
  const isScopeActive = view === 'project' && activeProjectSubView === 'scope'
  const isDetailsActive = view === 'project' && activeProjectSubView === 'details'

  function handleSettingsPress() {
    setShowSettingsPicker(v => !v)
  }

  function goToSettings(target: 'contractor-settings' | 'user-settings') {
    onNavigate(target)
    setShowSettingsPicker(false)
  }

  return (
    <>
      {/* Settings picker sheet */}
      {showSettingsPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowSettingsPicker(false)} />
          <div
            className="fixed left-0 right-0 z-40 shadow-xl"
            style={{
              bottom: 'calc(60px + env(safe-area-inset-bottom))',
              background: '#26215C',
              borderTop: '1px solid rgba(175,169,236,0.2)',
            }}
          >
            <div className="p-3 flex flex-col gap-1">
              <button
                onClick={() => goToSettings('contractor-settings')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left ${
                  view === 'contractor-settings'
                    ? 'text-white bg-white/15'
                    : 'hover:bg-white/10'
                }`}
                style={{ color: view === 'contractor-settings' ? '#fff' : 'rgba(206,203,246,0.8)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
                Contractor Settings
              </button>
              <button
                onClick={() => goToSettings('user-settings')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left ${
                  view === 'user-settings'
                    ? 'text-white bg-white/15'
                    : 'hover:bg-white/10'
                }`}
                style={{ color: view === 'user-settings' ? '#fff' : 'rgba(206,203,246,0.8)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
                User Settings
              </button>
            </div>
          </div>
        </>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: '#3C3489',
          borderTop: '1px solid rgba(175,169,236,0.25)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          minHeight: '60px',
        }}
      >
        {/* Dashboard */}
        <button
          onClick={() => { onNavigate('dashboard'); setShowSettingsPicker(false) }}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
          style={{ color: view === 'dashboard' ? '#ffffff' : 'rgba(206,203,246,0.55)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          <span className="text-[10px] font-medium leading-none">Dashboard</span>
        </button>

        {/* Project Scope shortcut */}
        {view === 'project' && onOpenProjectScope && (
          <button
            onClick={() => { onOpenProjectScope(); setShowSettingsPicker(false) }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
            style={{ color: isScopeActive ? '#ffffff' : 'rgba(206,203,246,0.55)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            <span className="text-[10px] font-medium leading-none">Project Scope</span>
          </button>
        )}

        {/* Project Details shortcut */}
        {activeProject && (
          <button
            onClick={() => { onOpenProjectDetails(activeProjectId!); setShowSettingsPicker(false) }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
            style={{ color: isDetailsActive ? '#ffffff' : 'rgba(206,203,246,0.55)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span className="text-[10px] font-medium leading-none">Project Details</span>
          </button>
        )}

        {/* Settings — opens picker */}
        <button
          onClick={handleSettingsPress}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
          style={{ color: isSettings || showSettingsPicker ? '#ffffff' : 'rgba(206,203,246,0.55)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          <span className="text-[10px] font-medium leading-none">Settings</span>
        </button>

        {/* Web Mode */}
        <button
          onClick={() => { toggle(); setShowSettingsPicker(false) }}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
          style={{ color: 'rgba(206,203,246,0.55)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span className="text-[10px] font-medium leading-none">Web Mode</span>
        </button>
      </nav>
    </>
  )
}
