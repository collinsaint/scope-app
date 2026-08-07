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
import { ProjectFinancialsView } from './components/ProjectFinancialsView'
import { InviteCodeGate } from './components/InviteCodeGate'
import { VerascopeLoader } from './components/VerascopeLoader'
import { seedDemoProject } from './lib/seedDemoProject'
import { loadProjectsFromSupabase, loadAllProjectsAsAdmin, syncProjectToSupabase, deleteProjectFromSupabase, loadSettingsFromSupabase, syncSettingsToSupabase, loadOrgSettingsForUser, syncOrgSettingsToSupabase } from './lib/supabaseSync'
import { supabase } from './lib/supabase'
import type { Project } from './types'

type AppView = 'dashboard' | 'project' | 'contractor-settings' | 'subcontractor-settings' | 'user-settings' | 'admin-portal' | 'financials' | 'project-financials'

const VALID_VIEWS: AppView[] = ['dashboard', 'project', 'contractor-settings', 'subcontractor-settings', 'user-settings', 'admin-portal', 'financials', 'project-financials']
const VALID_SUB_VIEWS = ['scope', 'details', 'comments'] as const
type ProjectSubView = typeof VALID_SUB_VIEWS[number]

function readSavedView(): AppView {
  try {
    const v = sessionStorage.getItem('ps-view') as AppView | null
    return v && VALID_VIEWS.includes(v) ? v : 'dashboard'
  } catch { return 'dashboard' }
}

function readSavedSubView(): ProjectSubView {
  try {
    const v = sessionStorage.getItem('ps-project-sub-view') as ProjectSubView | null
    return v && (VALID_SUB_VIEWS as readonly string[]).includes(v) ? v : 'scope'
  } catch { return 'scope' }
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { currentUser, loading: orgLoading, refresh: refreshCurrentUser } = useCurrentUser(user)
  const { projects, setActiveProject, activeProjectId, replaceProjects, replaceProject,
    globalSubcontractors, jobGroups, superintendents, walkPresets,
    replaceGlobalSubcontractors, replaceJobGroups, replaceSuperintendents, replaceWalkPresets,
    darkMode,
  } = useStore()
  const { isMobile } = useViewMode()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const [view, setView] = useState<AppView>(readSavedView)
  const [projectInitialView, setProjectInitialView] = useState<ProjectSubView>(readSavedSubView)
  const [projectSubView, setProjectSubView] = useState<ProjectSubView>(readSavedSubView)
  const [syncing, setSyncing] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [recentlyViewedProjectId, setRecentlyViewedProjectId] = useState<string | null>(null)
  const [adminRpcError, setAdminRpcError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const prevProjectsRef = useRef<Project[]>([])
  const prevProjectIdsRef = useRef(new Set<string>())
  const loadingFromSupabase = useRef(false)

  useEffect(() => {
    if (!user) {
      // Only clear the saved view when a real logout happens (prevUserIdRef was set).
      // On initial page load user is null before auth resolves — don't wipe sessionStorage then.
      if (prevUserIdRef.current !== null) {
        try { sessionStorage.removeItem('ps-view') } catch { /**/ }
        try { sessionStorage.removeItem('ps-project-sub-view') } catch { /**/ }
      }
      prevUserIdRef.current = null
      return
    }
    if (prevUserIdRef.current === user.id) return
    // Fresh login (not a refresh) — sessionStorage was cleared on logout, so go to dashboard.
    // On a page refresh sessionStorage still has the saved view, so skip the reset.
    const hasSavedView = (() => { try { return Boolean(sessionStorage.getItem('ps-view')) } catch { return false } })()
    if (!hasSavedView) setView('dashboard')
    prevUserIdRef.current = user.id

    async function loadFromSupabase() {
      loadingFromSupabase.current = true
      setSyncing(true)
      try {
        // Clear local state first — prevents another user's localStorage data showing
        replaceProjects([])
        const isAdmin = user?.email === 'admin@proscope.app'
        setAdminRpcError(null)
        const [projectsResult, remoteSettings] = await Promise.all([
          isAdmin
            ? loadAllProjectsAsAdmin()
            : loadProjectsFromSupabase().then(p => ({ projects: p, rpcError: null as string | null })),
          loadSettingsFromSupabase(),
        ])
        if (isAdmin && projectsResult.rpcError) setAdminRpcError(projectsResult.rpcError)
        const remoteProjects = projectsResult.projects
        if (remoteProjects.length > 0) {
          replaceProjects(remoteProjects)
          prevProjectsRef.current = remoteProjects
          prevProjectIdsRef.current = new Set(remoteProjects.map(p => p.id))
        } else {
          // No projects in Supabase yet — show demo so dashboard isn't empty
          seedDemoProject()
          // Reset refs so the sync effect doesn't treat stale localStorage IDs as
          // "deleted" projects and call deleteProjectFromSupabase on them.
          prevProjectsRef.current = []
          prevProjectIdsRef.current = new Set()
        }
        // Admin always sees the demo project
        if (isAdmin) seedDemoProject()
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
        prevProjectsRef.current = []
        prevProjectIdsRef.current = new Set()
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

  // Track the active project ID for autosave/save status scoping
  const activeProjectIdRef = useRef<string | null>(null)
  activeProjectIdRef.current = activeProjectId

  function markSaveStatus(status: 'saving' | 'saved' | 'error') {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
    setSaveStatus(status)
    if (status === 'saved') {
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  async function syncWithStatus(project: Project) {
    if (!user || user.email === 'admin@proscope.app') return
    markSaveStatus('saving')
    const ok = await syncProjectToSupabase(project, user.id, orgIdRef.current)
    markSaveStatus(ok ? 'saved' : 'error')
  }

  // Sync project changes to Supabase
  useEffect(() => {
    if (!user || loadingFromSupabase.current) return
    // Admin is read-only — never write back to Supabase on their behalf
    if (user.email === 'admin@proscope.app') {
      prevProjectsRef.current = projects
      prevProjectIdsRef.current = new Set(projects.map(p => p.id))
      return
    }
    const prev = prevProjectsRef.current
    const prevIds = prevProjectIdsRef.current
    const currentIds = new Set(projects.map(p => p.id))

    // Deleted projects
    prevIds.forEach(id => {
      if (!currentIds.has(id)) deleteProjectFromSupabase(id)
    })

    // Added or changed projects (skip demo)
    const changed: Project[] = []
    projects.forEach(project => {
      if (project.isDemo) return
      const unchanged = prev.find(p => p.id === project.id && p === project)
      if (!unchanged) changed.push(project)
    })

    if (changed.length > 0) {
      const activeChanged = changed.find(p => p.id === activeProjectIdRef.current)
      // Show save status only for the currently open project
      if (activeChanged) {
        syncWithStatus(activeChanged)
        changed.filter(p => p.id !== activeChanged.id).forEach(p => syncProjectToSupabase(p, user.id, orgIdRef.current))
      } else {
        changed.forEach(p => syncProjectToSupabase(p, user.id, orgIdRef.current))
      }
    }

    prevProjectsRef.current = projects
    prevProjectIdsRef.current = currentIds
  }, [projects, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave: every 60 s re-sync the active project so a failed reactive sync
  // doesn't silently lose data (e.g. large photo payloads that timeout once).
  useEffect(() => {
    const interval = setInterval(() => {
      if (!user || user.email === 'admin@proscope.app' || loadingFromSupabase.current) return
      const pid = activeProjectIdRef.current
      if (!pid) return
      const project = useStore.getState().projects.find(p => p.id === pid)
      if (!project || project.isDemo) return
      syncWithStatus(project)
    }, 60_000)
    return () => clearInterval(interval)
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleManualSave() {
    const pid = activeProjectIdRef.current
    if (!pid || !user) return
    const project = useStore.getState().projects.find(p => p.id === pid)
    if (!project || project.isDemo) return
    await syncWithStatus(project)
  }

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

  // Real-time: when another user (e.g. a sub) updates a project, pull the new data in
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('project-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projects' },
        (payload) => {
          if (loadingFromSupabase.current) return
          const updated = (payload.new as { data: Project }).data
          if (updated?.id) replaceProject(updated)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  function openProject(id: string, initialView: ProjectSubView = 'scope') {
    setActiveProject(id)
    setProjectInitialView(initialView)
    setProjectSubView(initialView)
    try { sessionStorage.setItem('ps-project-sub-view', initialView) } catch { /**/ }
    setView('project')
  }

  function handleSubViewChange(v: ProjectSubView) {
    setProjectSubView(v)
    try { sessionStorage.setItem('ps-project-sub-view', v) } catch { /**/ }
  }

  function openProjectFinancials(id: string) {
    setActiveProject(id)
    setView('project-financials')
  }

  function navigate(v: AppView, projectId?: string) {
    if (v === 'project' && projectId) {
      openProject(projectId, 'scope')
    } else {
      if (v === 'dashboard' && view === 'project' && activeProjectId) {
        setRecentlyViewedProjectId(activeProjectId)
      }
      setView(v)
      if (v !== 'project' && v !== 'project-financials') setActiveProject(null)
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
  // Superintendent role = contractor org member with role 'superintendent' (not admin/manager)
  const isSuperintendentRole = !isSubUser && !isAppAdmin && currentUser?.contractorRole === 'superintendent'
  // Anyone who can approve items (admins, managers, superintendents)
  const isSuperintendent = isContractorAdmin || isSuperintendentRole
  // When set, Dashboard filters to only projects assigned to this superintendent
  const superintendentUserId = isSuperintendentRole ? (user?.id ?? null) : null
  const superintendentName = isSuperintendentRole ? (currentUser?.profile.display_name ?? null) : null
  const canApprove = !isSubUser
  const currentUserName = currentUser?.profile.display_name ?? user?.email ?? undefined

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
          {isAppAdmin && adminRpcError && (
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 text-sm">
              <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-800">Admin RPC not found — projects cannot be loaded</p>
                <p className="text-amber-700 mt-0.5">Run <code className="bg-amber-100 px-1 rounded text-xs">supabase/admin_get_all_projects.sql</code> in the Supabase SQL Editor, then refresh.</p>
                <p className="text-amber-600 text-xs mt-1 font-mono break-all">{adminRpcError}</p>
              </div>
              <button onClick={() => setAdminRpcError(null)} className="text-amber-400 hover:text-amber-600 shrink-0 text-lg leading-none">×</button>
            </div>
          )}
          {view === 'dashboard' ? (
            <Dashboard
              onOpenProject={(id) => openProject(id, 'scope')}
              onOpenProjectDetails={(id) => openProject(id, 'details')}
              onOpenProjectFinancials={openProjectFinancials}
              isAppAdmin={isAppAdmin}
              onNavigateAdmin={() => navigate('admin-portal')}
              isSuperintendent={isSuperintendent}
              isSuperintendentRole={isSuperintendentRole}
              isSubUser={isSubUser}
              subOrgName={subOrgName}
              superintendentUserId={superintendentUserId}
              superintendentName={superintendentName}
              currentUserName={currentUserName}
              isContractorAdmin={isContractorAdmin}
              recentlyViewedProjectId={recentlyViewedProjectId}
            />
          ) : view === 'project' ? (
            <ProjectView
              projectId={activeProjectId ?? ''}
              onBack={() => {
                setRecentlyViewedProjectId(activeProjectId)
                try { sessionStorage.removeItem('ps-project-sub-view') } catch { /**/ }
                setNavigating(true)
                setTimeout(() => {
                  setView('dashboard')
                  setActiveProject(null)
                  setNavigating(false)
                }, 500)
              }}
              initialView={projectInitialView}
              onSubViewChange={handleSubViewChange}
              canManageProjectSubs={canManageProjectSubs}
              isContractorAdmin={isContractorAdmin}
              isSubUser={isSubUser}
              canApprove={canApprove}
              subOrgName={subOrgName}
              contractorOrgId={currentUser?.contractorOrg?.id ?? null}
              currentUserName={currentUserName}
              saveStatus={saveStatus}
              onManualSave={handleManualSave}
            />
          ) : view === 'project-financials' ? (() => {
            const proj = projects.find(p => p.id === activeProjectId)
            return proj ? (
              <ProjectFinancialsView
                project={proj}
                onBack={() => {
                  setView('dashboard')
                  setActiveProject(null)
                }}
                contractorOrgId={currentUser?.contractorOrg?.id ?? null}
                subOrgId={currentUser?.subcontractorOrg?.id ?? null}
                isSubUser={isSubUser}
                isContractorAdmin={isContractorAdmin}
                subOrgName={subOrgName}
              />
            ) : null
          })() : view === 'financials' ? (
            <FinancialsView
              isSubUser={isSubUser}
              subOrgId={currentUser?.subcontractorOrg?.id ?? null}
              contractorOrgId={currentUser?.contractorOrg?.id ?? null}
            />
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
            <UserSettingsView currentUser={currentUser} />
          )}
        </main>
        {isMobile && (
          <MobileNav
            view={view}
            onNavigate={navigate}
            onOpenProjectDetails={(id) => openProject(id, 'details')}
            onOpenProjectScope={activeProjectId ? () => openProject(activeProjectId, 'scope') : undefined}
            onOpenProjectFinancials={openProjectFinancials}
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
