import { useState, useEffect, useRef } from 'react'
import { useStore } from './store/useStore'
import { useViewMode } from './hooks/useViewMode'
import { useAuth } from './hooks/useAuth'
import { AuthGate } from './components/AuthGate'
import { Sidebar } from './components/Sidebar'
import { MobileNav } from './components/MobileNav'
import { Dashboard } from './components/Dashboard'
import { ProjectView } from './components/ProjectView'
import { ContractorSettingsView } from './components/ContractorSettingsView'
import { UserSettingsView } from './components/UserSettingsView'
import { seedDemoProject } from './lib/seedDemoProject'
import { loadProjectsFromSupabase, syncProjectToSupabase, deleteProjectFromSupabase } from './lib/supabaseSync'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'user-settings'

const VALID_VIEWS: AppView[] = ['dashboard', 'project', 'contractor-settings', 'user-settings']

function readSavedView(): AppView {
  try {
    const v = sessionStorage.getItem('ps-view') as AppView | null
    return v && VALID_VIEWS.includes(v) ? v : 'dashboard'
  } catch { return 'dashboard' }
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { projects, setActiveProject, activeProjectId, replaceProjects } = useStore()
  const { isMobile } = useViewMode()

  const [view, setView] = useState<AppView>(readSavedView)
  const [projectInitialView, setProjectInitialView] = useState<'scope' | 'details'>('scope')
  const [projectSubView, setProjectSubView] = useState<'scope' | 'details' | 'comments'>('scope')
  const [syncing, setSyncing] = useState(false)

  // Persist view to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem('ps-view', view) } catch { /**/ }
  }, [view])

  // On login: load projects from Supabase
  const prevUserIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user) {
      prevUserIdRef.current = null
      return
    }
    if (prevUserIdRef.current === user.id) return
    prevUserIdRef.current = user.id

    async function loadFromSupabase() {
      setSyncing(true)
      const remoteProjects = await loadProjectsFromSupabase()
      if (remoteProjects.length > 0) {
        replaceProjects(remoteProjects)
      } else if (projects.length > 0) {
        // First login — migrate existing local projects to Supabase
        await Promise.all(projects.filter(p => !p.isDemo).map(p => syncProjectToSupabase(p, user!.id)))
      } else {
        seedDemoProject()
      }
      setSyncing(false)
    }
    loadFromSupabase()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Sync project changes to Supabase
  const prevProjectsRef = useRef(projects)
  const prevProjectIdsRef = useRef(new Set(projects.map(p => p.id)))
  useEffect(() => {
    if (!user) return
    const prev = prevProjectsRef.current
    const prevIds = prevProjectIdsRef.current
    const currentIds = new Set(projects.map(p => p.id))

    // Deleted projects
    prevIds.forEach(id => {
      if (!currentIds.has(id)) deleteProjectFromSupabase(id)
    })

    // Added or changed projects (skip demo)
    projects.forEach(project => {
      if (project.isDemo) return
      const unchanged = prev.find(p => p.id === project.id && p === project)
      if (!unchanged) syncProjectToSupabase(project, user.id)
    })

    prevProjectsRef.current = projects
    prevProjectIdsRef.current = currentIds
  }, [projects, user])

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

  if (authLoading) {
    return (
      <div className="flex items-center justify-center bg-slate-900" style={{ height: '100dvh' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <p className="text-slate-400 text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <AuthGate>
      <div className="flex overflow-hidden bg-slate-100" style={{ height: '100dvh' }}>
        {syncing && (
          <div className="fixed top-3 right-3 z-[100] bg-slate-800 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 pointer-events-none">
            <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            Syncing…
          </div>
        )}
        <Sidebar view={view} onNavigate={navigate} onSignOut={signOut} userEmail={user?.email} />
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
        {isMobile && (
          <MobileNav
            view={view}
            onNavigate={navigate}
            onOpenProjectDetails={(id) => openProject(id, 'details')}
            onOpenProjectScope={activeProjectId ? () => openProject(activeProjectId, 'scope') : undefined}
            activeProjectSubView={projectSubView}
          />
        )}
      </div>
    </AuthGate>
  )
}
