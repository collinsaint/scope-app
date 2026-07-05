import { useStore } from '../store/useStore'
import { useViewMode } from '../hooks/useViewMode'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'user-settings'

interface Props {
  view: AppView
  onNavigate: (view: AppView, projectId?: string) => void
  onOpenProjectDetails: (id: string) => void
}

export function MobileNav({ view, onNavigate, onOpenProjectDetails }: Props) {
  const { projects, activeProjectId } = useStore()
  const { toggle } = useViewMode()
  const activeProject = projects.find(p => p.id === activeProjectId)

  const isSettings = view === 'contractor-settings' || view === 'user-settings'

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700/60 z-50 flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', minHeight: '60px' }}
    >
      {/* Dashboard */}
      <button
        onClick={() => onNavigate('dashboard')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
          view === 'dashboard' ? 'text-blue-400' : 'text-slate-400 active:text-slate-200'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        <span className="text-[10px] font-medium leading-none">Dashboard</span>
      </button>

      {/* Project Details shortcut */}
      {activeProject && (
        <button
          onClick={() => onOpenProjectDetails(activeProjectId!)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
            view === 'project' ? 'text-blue-400' : 'text-slate-400 active:text-slate-200'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="text-[10px] font-medium leading-none">Project Details</span>
        </button>
      )}

      {/* Settings */}
      <button
        onClick={() => onNavigate('contractor-settings')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
          isSettings ? 'text-blue-400' : 'text-slate-400 active:text-slate-200'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        <span className="text-[10px] font-medium leading-none">Settings</span>
      </button>

      {/* Web mode toggle */}
      <button
        onClick={toggle}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-slate-500 active:text-slate-200 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <span className="text-[10px] font-medium leading-none">Web Mode</span>
      </button>
    </nav>
  )
}
