import { useState, useEffect, useRef } from 'react'
import { useStore } from './store/useStore'
import { useViewMode } from './hooks/useViewMode'
import { useAuth } from './hooks/useAuth'
import { useCurrentUser } from './hooks/useCurrentUser'
import { LandingPage } from './components/LandingPage'
import { Sidebar } from './components/Sidebar'
import { MobileNav } from './components/MobileNav'
import { Dashboard } from './components/Dashboard'
import { ProjectView } from './components/ProjectView'
import { ContractorSettingsView } from './components/ContractorSettingsView'
import { SubcontractorSettingsView } from './components/SubcontractorSettingsView'
import { UserSettingsView } from './components/UserSettingsView'
import { AdminPortalView } from './components/AdminPortalView'
import { FinancialsView } from './components/FinancialsView'
import { InviteCodeGate } from './components/InviteCodeGate'
import { VerascopeLoader } from './components/VerascopeLoader'
import { seedDemoProject } from './lib/seedDemoProject'
import { loadProjectsFromSupabase, syncProjectToSupabase, deleteProjectFromSupabase, loadSettingsFromSupabase, syncSettingsToSupabase, loadOrgSettingsForUser, syncOrgSettingsToSupabase } from './lib/supabaseSync'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'subcontractor-settings' | 'user-settings' | 'admin-portal' | 'financials'

const VALID_VIEWS: AppView[] = ['dashboard', 'project', 'contractor-settings', 'subcontractor-settings', 'user-settings', 'admin-portal', 'financials']

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

  // Guard: redirect users away from views they don't have access to
  useEffect(() => {
    if (!user) return
    const isAdmin = user.email === 'admin@proscope.app'
    const isContrAdmin = isAdmin || currentUser?.contractorRole === 'admin' || currentUser?.contractorRole === 'manager'
    if (view === 'admin-portal' && !isAdmin) setView('dashboard')
    if (view === 'contractor-settings' && !isContrAdmin) setView('dashboard')
  }, [user?.id, currentUser?.contractorRole])  // eslint-disable-line react-hooks/exhaustive-deps

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
        // Apply user-level settings
        if (remoteSettings.walkPresets) replaceWalkPresets(remoteSettings.walkPresets)
        // Apply org-level settings (shared across the contractor org)
        const orgSettings = await loadOrgSettingsForUser(user!.id)
        if (orgSettings.globalSubcontractors) replaceGlobalSubcontractors(orgSettings.globalSubcontractors)
        if (orgSettings.jobGroups) replaceJobGroups(orgSettings.jobGroups)
        if (orgSettings.superintendents) replaceSuperintendents(orgSettings.superintendents)
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

  // Keep a ref to org ID so the sync effect always sees the current value
  const orgIdRef = useRef<string | undefined>(undefined)
  orgIdRef.current = currentUser?.contractorOrg?.id ?? currentUser?.subcontractorOrg?.id ?? undefined

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
      if (!unchanged) syncProjectToSupabase(project, user.id, orgIdRef.current)
    })

    prevProjectsRef.current = projects
    prevProjectIdsRef.current = currentIds
  }, [projects, user])

  // Sync user-level settings (walkPresets only — globalSubcontractors moved to org-level)
  useEffect(() => {
    if (!user || loadingFromSupabase.current) return
    const timer = setTimeout(() => {
      syncSettingsToSupabase({ walkPresets }, user.id)
    }, 1000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkPresets, user?.id])

  // Sync org-level settings (globalSubcontractors, jobGroups, superintendents) — shared across the contractor org
  useEffect(() => {
    const orgId = orgIdRef.current
    if (!orgId || loadingFromSupabase.current) return
    const timer = setTimeout(() => {
      syncOrgSettingsToSupabase({ globalSubcontractors, jobGroups, superintendents }, orgId)
    }, 1000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSubcontractors, jobGroups, superintendents])

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

  const isAppAdmin = user?.email === 'admin@proscope.app'
  const isContractorAdmin = isAppAdmin || currentUser?.contractorRole === 'admin' || currentUser?.contractorRole === 'manager'
  const canManageProjectSubs = isAppAdmin || !!currentUser?.contractorOrg
  const isSubUser = !!currentUser?.subcontractorOrg
  const subOrgName = currentUser?.subcontractorOrg?.name ?? undefined
  const isSubManager = isSubUser && currentUser?.subcontractorRole === 'manager'
  const isSuperintendent = isAppAdmin || !!currentUser?.contractorOrg
  const canApprove = !isSubUser

  if (!user) {
    return <LandingPage />
  }

  // Logged in but no org → invite code gate (unless app admin)
  if (!isAppAdmin && currentUser && !currentUser.contractorOrg && !currentUser.subcontractorOrg) {
    return <InviteCodeGate user={user} onJoined={refreshCurrentUser} onSignOut={signOut} />
  }

  return (
    <>
      <div className="flex overflow-hidden bg-slate-100" style={{ height: '100dvh' }}>
        {(syncing || navigating) && <VerascopeLoader message={navigating ? 'Loading…' : 'Syncing your projects…'} />}
        <Sidebar view={view} onNavigate={navigate} onSignOut={signOut} userEmail={user?.email} isAppAdmin={isAppAdmin} isContractorAdmin={isContractorAdmin} isSubUser={isSubUser} isSubManager={isSubManager} />
        <main className={`flex-1 flex flex-col overflow-hidden ${isMobile ? 'pb-[60px]' : ''}`}>
          {view === 'dashboard' ? (
            <Dashboard
              onOpenProject={(id) => openProject(id, 'scope')}
              onOpenProjectDetails={(id) => openProject(id, 'details')}
              isAppAdmin={isAppAdmin}
              onNavigateAdmin={() => navigate('admin-portal')}
              isSuperintendent={isSuperintendent}
              isSubUser={isSubUser}
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
              canManageProjectSubs={canManageProjectSubs}
              isSubUser={isSubUser}
              canApprove={canApprove}
              subOrgName={subOrgName}
            />
          ) : view === 'financials' ? (
            <FinancialsView />
          ) : view === 'contractor-settings' ? (
            <ContractorSettingsView />
          ) : view === 'subcontractor-settings' ? (
            <SubcontractorSettingsView
              subOrgId={currentUser?.subcontractorOrg?.id ?? ''}
              subOrgName={currentUser?.subcontractorOrg?.name ?? ''}
            />
          ) : view === 'admin-portal' ? (
            <AdminPortalView />
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
            isAppAdmin={isAppAdmin}
            isContractorAdmin={isContractorAdmin}
            isSubUser={isSubUser}
            isSubManager={isSubManager}
          />
        )}
      </div>
    </>
  )
}
