import { useState, useEffect } from 'react'
import { useStore } from './store/useStore'
import { useViewMode } from './hooks/useViewMode'
import { Sidebar } from './components/Sidebar'
import { MobileNav } from './components/MobileNav'
import { Dashboard } from './components/Dashboard'
import { ProjectView } from './components/ProjectView'
import { ContractorSettingsView } from './components/ContractorSettingsView'
import { UserSettingsView } from './components/UserSettingsView'
import { seedDemoProject } from './lib/seedDemoProject'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'user-settings'

const VALID_VIEWS: AppView[] = ['dashboard', 'project', 'contractor-settings', 'user-settings']

function readSavedView(): AppView {
  try {
    const v = sessionStorage.getItem('ps-view') as AppView | null
    return v && VALID_VIEWS.includes(v) ? v : 'dashboard'
  } catch { return 'dashboard' }
}

export default function App() {
  const { setActiveProject, activeProjectId } = useStore()

  useEffect(() => { seedDemoProject() }, [])
  const { isMobile } = useViewMode()
  const [view, setView] = useState<AppView>(readSavedView)
  const [projectInitialView, setProjectInitialView] = useState<'scope' | 'details'>('scope')

  // Persist view to sessionStorage so refresh restores the same page
  useEffect(() => {
    try { sessionStorage.setItem('ps-view', view) } catch { /**/ }
  }, [view])
  const [projectSubView, setProjectSubView] = useState<'scope' | 'details' | 'comments'>('scope')

  function openProject(id: string, initialView: 'scope' | 'details' = 'scope') {
    setActiveProject(id)
    setProjectInitialView(initialView)
    setView('project')
  }

  function navigate(v: AppView, projectId?: string) {
    if (v === 'project' && projectId) {
      openProject(projectId, 'scope')
    } else {
      setView(v)
      if (v !== 'project') setActiveProject(null)
    }
  }

  return (
    <div className="flex overflow-hidden bg-slate-100" style={{ height: '100dvh' }}>
      <Sidebar view={view} onNavigate={navigate} />
      <main className={`flex-1 flex flex-col overflow-hidden ${isMobile ? 'pb-[60px]' : ''}`}>
        {view === 'dashboard' ? (
          <Dashboard
            onOpenProject={(id) => openProject(id, 'scope')}
            onOpenProjectDetails={(id) => openProject(id, 'details')}
          />
        ) : view === 'project' ? (
          <ProjectView
            projectId={activeProjectId ?? ''}
            onBack={() => { setView('dashboard'); setActiveProject(null) }}
            initialView={projectInitialView}
            onSubViewChange={setProjectSubView}
          />
        ) : view === 'contractor-settings' ? (
          <ContractorSettingsView />
        ) : (
          <UserSettingsView />
        )}
      </main>
      {isMobile && <MobileNav view={view} onNavigate={navigate} onOpenProjectDetails={(id) => openProject(id, 'details')} onOpenProjectScope={activeProjectId ? () => openProject(activeProjectId, 'scope') : undefined} activeProjectSubView={projectSubView} />}
    </div>
  )
}
