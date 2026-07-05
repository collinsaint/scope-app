import { useState } from 'react'
import { useStore } from './store/useStore'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './components/Dashboard'
import { ProjectView } from './components/ProjectView'
import { ContractorSettingsView } from './components/ContractorSettingsView'
import { UserSettingsView } from './components/UserSettingsView'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'user-settings'

export default function App() {
  const { setActiveProject, activeProjectId } = useStore()
  const [view, setView] = useState<AppView>('dashboard')
  const [projectInitialView, setProjectInitialView] = useState<'scope' | 'details'>('scope')

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
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar view={view} onNavigate={navigate} />
      <main className="flex-1 flex flex-col overflow-hidden">
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
          />
        ) : view === 'contractor-settings' ? (
          <ContractorSettingsView />
        ) : (
          <UserSettingsView />
        )}
      </main>
    </div>
  )
}
