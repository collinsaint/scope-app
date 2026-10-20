import { useState, useEffect, useRef } from 'react'
import { configureProjectSync, setSyncContext, resetProjectSync, recordRemote, isBase, scheduleSave, saveNow, onSyncStatus, hasLocalChanges, hasPendingSaves, mergeProjects, getBase } from './lib/projectSync'
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
import { loadProjectsWithVersions, loadAllProjectsAsAdmin, deleteProjectFromSupabase, consumeExplicitDeletes, loadSettingsFromSupabase, syncSettingsToSupabase, loadOrgSettingsForUser, syncOrgSettingsToSupabase } from './lib/supabaseSync'
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
  const [loadError, setLoadError] = useState<string | null>(null)
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
        resetProjectSync()
        const isAdmin = user?.email === 'admin@proscope.app'
        setAdminRpcError(null)
        const [projectsResult, remoteSettings] = await Promise.all([
          isAdmin
            ? loadAllProjectsAsAdmin()
            : loadProjectsWithVersions().then(r => ({ projects: r.projects, versions: r.versions, rpcError: r.error })),
          loadSettingsFromSupabase(),
        ])
        if (projectsResult.rpcError) {
          if (isAdmin) setAdminRpcError(projectsResult.rpcError)
          else setLoadError(projectsResult.rpcError)
        } else setLoadError(null)
        const remoteProjects = projectsResult.projects
        const versions = ('versions' in projectsResult ? projectsResult.versions : {}) as Record<string, string>
        if (remoteProjects.length > 0) {
          replaceProjects(remoteProjects)
          // Record the post-hydration store objects as the sync base so the
          // sync effect doesn't immediately write every project back.
          const hydrated = useStore.getState().projects
          hydrated.forEach(p => recordRemote(p, versions[p.id] ?? null))
          prevProjectsRef.current = hydrated
          prevProjectIdsRef.current = new Set(hydrated.map(p => p.id))
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

  function markSaveStatus(status: 'idle' | 'saving' | 'saved' | 'error') {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
    setSaveStatus(status)
    if (status === 'saved') {
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  // Wire the sync engine to the store once.
  useEffect(() => {
    configureProjectSync({
      getLatest: id => useStore.getState().projects.find(p => p.id === id),
      applyMerged: merged => useStore.getState().replaceProject(merged),
    })
    return onSyncStatus((pid, status) => {
      if (pid === activeProjectIdRef.current) markSaveStatus(status)
    })
  }, [])

  const isAppAdminUser = user?.email === 'admin@proscope.app'
  useEffect(() => {
    setSyncContext(user && !isAppAdminUser ? { ownerId: user.id, orgId: orgIdRef.current } : null)
  })

  // Sync project changes to Supabase
  useEffect(() => {
    if (!user || loadingFromSupabase.current) return
    // Admin is read-only — never write back to Supabase on their behalf
    if (isAppAdminUser) {
      prevProjectsRef.current = projects
      prevProjectIdsRef.current = new Set(projects.map(p => p.id))
      return
    }
    const prev = prevProjectsRef.current
    const currentIds = new Set(projects.map(p => p.id))

    // Only projects the user explicitly deleted are deleted on the server.
    consumeExplicitDeletes(currentIds).forEach(id => { deleteProjectFromSupabase(id) })

    const prevById = new Map(prev.map(p => [p.id, p]))
    projects.forEach(project => {
      if (project.isDemo) return
      if (prevById.get(project.id) === project) return
      if (isBase(project)) return // came from the server (load/realtime) — don't echo it back
      scheduleSave(project.id)
    })

    prevProjectsRef.current = projects
    prevProjectIdsRef.current = currentIds
  }, [projects, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: every 60 s retry any project whose last save failed or that
  // still differs from what the server has.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!user || isAppAdminUser || loadingFromSupabase.current) return
      useStore.getState().projects.forEach(p => {
        if (!p.isDemo && hasLocalChanges(p.id)) scheduleSave(p.id, true)
      })
    }, 60_000)
    return () => clearInterval(interval)
  }, [user, isAppAdminUser])

  // Warn before closing the tab while edits are unsaved.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (hasPendingSaves()) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  async function handleManualSave() {
    const pid = activeProjectId
    if (!pid || !user) return
    const project = useStore.getState().projects.find(p => p.id === pid)
    if (!project || project.isDemo) return
    await saveNow(pid)
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
          const row = payload.new as { data?: Project; updated_at?: string }
          const updated = row.data
          if (!updated?.id) return
          const local = useStore.getState().projects.find(p => p.id === updated.id)
          if (!local) return
          // Ignore our own echo / stale events.
          const base = getBase(updated.id)
          if (base && JSON.stringify(base) === JSON.stringify(updated)) { recordRemote(base, row.updated_at ?? null); return }
          const next = hasLocalChanges(updated.id) ? mergeProjects(base, local, updated) : updated
          replaceProject(next)
          const stored = useStore.getState().projects.find(p => p.id === updated.id)
          if (stored) recordRemote(next === updated ? stored : updated, row.updated_at ?? null)
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
          {!isAppAdmin && loadError && (
            <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border-b border-red-200 text-sm">
              <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-red-800">Couldn't load your projects from the server</p>
                <p className="text-red-700 mt-0.5">Your data is safe. Check your connection and refresh the page.</p>
                <p className="text-red-600 text-xs mt-1 font-mono break-all">{loadError}</p>
              </div>
              <button onClick={() => setLoadError(null)} className="text-red-400 hover:text-red-600 shrink-0 text-lg leading-none">×</button>
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
