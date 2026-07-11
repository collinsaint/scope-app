import { useState, useEffect, useRef } from 'react'
import { useStore } from './store/useStore'
import { useViewMode } from './hooks/useViewMode'
import { useAuth } from './hooks/useAuth'
import { useCurrentUser } from './hooks/useCurrentUser'
import { AuthGate } from './components/AuthGate'
import { OrgOnboarding } from './components/OrgOnboarding'
import { Sidebar } from './components/Sidebar'
import { MobileNav } from './components/MobileNav'
import { Dashboard } from './components/Dashboard'
import { ProjectView } from './components/ProjectView'
import { ContractorSettingsView } from './components/ContractorSettingsView'
import { UserSettingsView } from './components/UserSettingsView'
import { VerascopeLoader } from './components/VerascopeLoader'
import { seedDemoProject } from './lib/seedDemoProject'
import { loadProjectsFromSupabase, syncProjectToSupabase, deleteProjectFromSupabase, loadSettingsFromSupabase, syncSettingsToSupabase } from './lib/supabaseSync'

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
  const { currentUser, loading: orgLoading, refresh: refreshCurrentUser } = useCurrentUser(user)
  const { projects, setActiveProject, activeProjectId, replaceProjects,
    globalSubcontractors, jobGroups, superintendents, walkPresets,
    replaceGlobalSubcontractors, replaceJobGroups, replaceSuperintendents, replaceWalkPresets,
    darkMode,
  } = useStore()
  const { isMobile } = useViewMode()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const [view, setView] = useState<AppView>(readSavedView)
  const [projectInitialView, setProjectInitialView] = useState<'scope' | 'details'>('scope')
  const [projectSubView, setProjectSubView] = useState<'scope' | 'details' | 'comments'>('scope')
  const [syncing, setSyncing] = useState(false)
  const [navigating, setNavigating] = useState(false)

  // Persist view to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem('ps-view', view) } catch { /**/ }
  }, [view])

  // On login: load projects from Supabase
  const prevUserIdRef = useRef<string | null>(null)
  const prevProjectsRef = useRef(projects)
  const prevProjectIdsRef = useRef(new Set(projects.map(p => p.id)))
  const loadingFromSupabase = useRef(false)

  useEffect(() => {
    if (!user) {
      prevUserIdRef.current = null
      return
    }
    if (prevUserIdRef.current === user.id) return
    prevUserIdRef.current = user.id

    async function loadFromSupabase() {
      loadingFromSupabase.current = true
      setSyncing(true)
      try {
        // Clear local state first — prevents another user's localStorage data showing
        replaceProjects([])
        const [remoteProjects, remoteSettings] = await Promise.all([
          loadProjectsFromSupabase(),
          loadSettingsFromSupabase(),
        ])
        if (remoteProjects.length > 0) {
          replaceProjects(remoteProjects)
          // Pre-seed refs so the sync effect sees no diff and skips re-uploading
          prevProjectsRef.current = remoteProjects
          prevProjectIdsRef.current = new Set(remoteProjects.map(p => p.id))
        } else {
          // No projects in Supabase yet — show demo so dashboard isn't empty
          seedDemoProject()
        }
        // Admin always sees the demo project regardless of other projects
        if (user?.email === 'admin@proscope.app') {
          seedDemoProject()
        }
        // Apply remote settings if they exist
        if (remoteSettings.globalSubcontractors) replaceGlobalSubcontractors(remoteSettings.globalSubcontractors)
        if (remoteSettings.jobGroups) replaceJobGroups(remoteSettings.jobGroups)
        if (remoteSettings.superintendents) replaceSuperintendents(remoteSettings.superintendents)
        if (remoteSettings.walkPresets) replaceWalkPresets(remoteSettings.walkPresets)
      } catch (err) {
        console.error('Failed to load from Supabase:', err)
        seedDemoProject()
      } finally {
        loadingFromSupabase.current = false
        setSyncing(false)
      }
    }
    loadFromSupabase()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Sync project changes to Supabase
  useEffect(() => {
    if (!user || loadingFromSupabase.current) return
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

  // Sync settings changes to Supabase (debounced 1s)
  useEffect(() => {
    if (!user || loadingFromSupabase.current) return
    const timer = setTimeout(() => {
      syncSettingsToSupabase({ globalSubcontractors, jobGroups, superintendents, walkPresets }, user.id)
    }, 1000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSubcontractors, jobGroups, superintendents, walkPresets, user?.id])

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

  if (authLoading || (user && orgLoading)) {
    return <VerascopeLoader message="Loading…" />
  }

  // Logged-in user with no org yet — show onboarding
  if (user && currentUser && !currentUser.contractorOrg && !currentUser.subcontractorOrg) {
    return <OrgOnboarding user={user} onComplete={refreshCurrentUser} />
  }

  return (
    <AuthGate>
      <div className="flex overflow-hidden bg-slate-100" style={{ height: '100dvh' }}>
        {(syncing || navigating) && <VerascopeLoader message={navigating ? 'Loading…' : 'Syncing your projects…'} />}
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
              onBack={() => {
                setNavigating(true)
                setTimeout(() => {
                  setView('dashboard')
                  setActiveProject(null)
                  setNavigating(false)
                }, 500)
              }}
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
            onSignOut={signOut}
          />
        )}
      </div>
    </AuthGate>
  )
}
