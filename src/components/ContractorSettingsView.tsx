import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import type { GlobalSubcontractor, JobGroup, Superintendent } from '../types'
import { fetchContractorSubOrgs, type SubOrg } from '../lib/supabaseSync'
import { supabase } from '../lib/supabase'

const PRESET_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16']

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface OrgUser {
  user_id: string
  role: string
  display_name: string | null
  email: string
  project_ids: string[]
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  superintendent: 'Superintendent',
}
const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-violet-50 border-violet-200 text-violet-700',
  manager: 'bg-blue-50 border-blue-200 text-blue-700',
  superintendent: 'bg-emerald-50 border-emerald-200 text-emerald-700',
}

export function ContractorSettingsView() {
  const { globalSubcontractors, addGlobalSubcontractor, updateGlobalSubcontractor, deleteGlobalSubcontractor, jobGroups, addJobGroup, updateJobGroup, deleteJobGroup, superintendents, addSuperintendent, updateSuperintendent, deleteSuperintendent, projects } = useStore()

  const [linkedSubOrgs, setLinkedSubOrgs] = useState<SubOrg[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Users section state
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set()) // "userId:projectId"

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'superintendent'>('superintendent')
  const [inviting, setInviting] = useState(false)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function copyToken(token: string) {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) { setInviteError('Email is required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setInviteError('Enter a valid email address.'); return }
    if (!orgId) return
    setInviting(true)
    setInviteError(null)
    setInviteToken(null)
    try {
      const { data: inv, error } = await supabase
        .from('invitations')
        .insert({ email, org_id: orgId, role: inviteRole })
        .select('token')
        .single()
      if (error || !inv) throw new Error(error?.message ?? 'Failed to create invitation')
      setInviteToken(inv.token)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setInviting(false)
    }
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase.from('org_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
      if (!member?.org_id) return
      setOrgId(member.org_id)
      const adminOrManager = member.role === 'admin' || member.role === 'manager'
      setIsAdmin(adminOrManager)
      const orgs = await fetchContractorSubOrgs(member.org_id)
      setLinkedSubOrgs(orgs)
    }
    load()
  }, [])

  // Load org users whenever orgId + isAdmin become available
  useEffect(() => {
    if (!orgId || !isAdmin) return
    async function loadUsers() {
      setUsersLoading(true)
      setUsersError(null)
      try {
        const { data, error } = await supabase.rpc('get_org_user_access', { p_org_id: orgId })
        if (error) throw error
        setOrgUsers((data ?? []).map((row: { user_id: string; role: string; display_name: string | null; email: string; project_ids: string[] }) => ({
          ...row,
          project_ids: row.project_ids ?? [],
        })))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('not exist') || msg.includes('function')) {
          setUsersError('Run supabase/add_user_project_access_rpc.sql in your Supabase dashboard to enable this feature.')
        } else {
          setUsersError('Failed to load users.')
        }
      } finally {
        setUsersLoading(false)
      }
    }
    loadUsers()
  }, [orgId, isAdmin])

  async function toggleProjectAccess(targetUser: OrgUser, projectId: string) {
    if (!orgId) return
    const key = `${targetUser.user_id}:${projectId}`
    if (pendingToggles.has(key)) return
    const hasAccess = targetUser.project_ids.includes(projectId)
    const project = projects.find(p => p.id === projectId)
    const action = hasAccess ? 'Remove' : 'Grant'
    if (!confirm(`${action} access to "${project?.name ?? projectId}" for ${targetUser.display_name ?? targetUser.email}?`)) return

    setPendingToggles(prev => new Set(prev).add(key))
    try {
      const { error } = await supabase.rpc('manage_user_project_access', {
        p_org_id: orgId,
        p_user_id: targetUser.user_id,
        p_project_id: projectId,
        p_grant: !hasAccess,
      })
      if (error) throw error
      // Optimistic update
      setOrgUsers(prev => prev.map(u => {
        if (u.user_id !== targetUser.user_id) return u
        const newIds = hasAccess
          ? u.project_ids.filter(id => id !== projectId)
          : [...u.project_ids, projectId]
        return { ...u, project_ids: newIds }
      }))
    } catch (err) {
      alert('Failed to update access: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPendingToggles(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newPct, setNewPct] = useState('')
  const [newSubOrgId, setNewSubOrgId] = useState('')
  const [addError, setAddError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(PRESET_COLORS[0])
  const [editPct, setEditPct] = useState('')
  const [editSubOrgId, setEditSubOrgId] = useState('')
  const [editError, setEditError] = useState('')

  const [newGroupName, setNewGroupName] = useState('')
  const [groupAddError, setGroupAddError] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [groupEditError, setGroupEditError] = useState('')

  const [newSuperName, setNewSuperName] = useState('')
  const [superAddError, setSuperAddError] = useState('')
  const [editingSuperId, setEditingSuperId] = useState<string | null>(null)
  const [editSuperName, setEditSuperName] = useState('')
  const [superEditError, setSuperEditError] = useState('')

  function handleAdd() {
    const name = newName.trim()
    if (!name) { setAddError('Name is required.'); return }
    if (globalSubcontractors.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setAddError('A subcontractor with that name already exists.')
      return
    }
    const pct = parseFloat(newPct)
    if (isNaN(pct) || pct < 0 || pct > 100) { setAddError('Enter a percentage between 0 and 100.'); return }
    addGlobalSubcontractor({ id: generateId(), name, color: newColor, defaultPercentage: pct, subOrgId: newSubOrgId || undefined })
    setNewName('')
    setNewPct('')
    setNewColor(PRESET_COLORS[0])
    setNewSubOrgId('')
    setAddError('')
  }

  function startEdit(sub: GlobalSubcontractor) {
    setEditingId(sub.id)
    setEditName(sub.name)
    setEditColor(sub.color)
    setEditPct(String(sub.defaultPercentage))
    setEditSubOrgId(sub.subOrgId ?? '')
    setEditError('')
  }

  function saveEdit(id: string) {
    const name = editName.trim()
    if (!name) { setEditError('Name is required.'); return }
    if (globalSubcontractors.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      setEditError('Another subcontractor with that name already exists.')
      return
    }
    const pct = parseFloat(editPct)
    if (isNaN(pct) || pct < 0 || pct > 100) { setEditError('Enter a percentage between 0 and 100.'); return }
    updateGlobalSubcontractor(id, { name, color: editColor, defaultPercentage: pct, subOrgId: editSubOrgId || undefined })
    setEditingId(null)
  }

  function handleAddGroup() {
    const name = newGroupName.trim()
    if (!name) { setGroupAddError('Name is required.'); return }
    if (jobGroups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      setGroupAddError('A job group with that name already exists.')
      return
    }
    addJobGroup({ id: generateId(), name })
    setNewGroupName('')
    setGroupAddError('')
  }

  function startEditGroup(g: JobGroup) {
    setEditingGroupId(g.id)
    setEditGroupName(g.name)
    setGroupEditError('')
  }

  function saveEditGroup(id: string) {
    const name = editGroupName.trim()
    if (!name) { setGroupEditError('Name is required.'); return }
    if (jobGroups.some(g => g.id !== id && g.name.toLowerCase() === name.toLowerCase())) {
      setGroupEditError('Another job group with that name already exists.')
      return
    }
    updateJobGroup(id, name)
    setEditingGroupId(null)
  }

  function handleAddSuper() {
    const name = newSuperName.trim()
    if (!name) { setSuperAddError('Name is required.'); return }
    if (superintendents.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setSuperAddError('A superintendent with that name already exists.')
      return
    }
    addSuperintendent({ id: generateId(), name })
    setNewSuperName('')
    setSuperAddError('')
  }

  function startEditSuper(su: Superintendent) {
    setEditingSuperId(su.id)
    setEditSuperName(su.name)
    setSuperEditError('')
  }

  function saveEditSuper(id: string) {
    const name = editSuperName.trim()
    if (!name) { setSuperEditError('Name is required.'); return }
    if (superintendents.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
      setSuperEditError('Another superintendent with that name already exists.')
      return
    }
    updateSuperintendent(id, name)
    setEditingSuperId(null)
  }

  const billableProjects = projects.filter(p => !p.isDemo)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contractor Settings</h1>
          <p className="page-subtitle">Manage global subcontractors and their default payout percentages.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl flex flex-col gap-5">

          {/* Users section — admin/manager only */}
          {isAdmin && (
            <div className="section-card">
              <div className="section-card-header">
                <h2 className="text-sm font-semibold text-slate-800">Users</h2>
                <p className="text-xs text-slate-400 mt-0.5">View org members and manage project access for superintendents.</p>
              </div>

              {usersLoading ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-slate-400">Loading users…</p>
                </div>
              ) : usersError ? (
                <div className="px-5 py-6">
                  <p className="text-xs text-red-500">{usersError}</p>
                </div>
              ) : orgUsers.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-slate-400">No users found.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {orgUsers.map(u => {

                    const roleCfg = ROLE_COLORS[u.role] ?? 'bg-slate-50 border-slate-200 text-slate-600'
                    const roleLabel = ROLE_LABELS[u.role] ?? u.role
                    const isSuper = u.role === 'superintendent'
                    const isExpanded = expandedUserId === u.user_id
                    const accessCount = u.project_ids.length

                    return (
                      <div key={u.user_id}>
                        <div className="flex items-center gap-3 px-5 py-3.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {u.display_name ?? u.email}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                          </div>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${roleCfg} flex-shrink-0`}>
                            {roleLabel}
                          </span>
                          {isSuper ? (
                            <button
                              onClick={() => setExpandedUserId(isExpanded ? null : u.user_id)}
                              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0"
                            >
                              {accessCount}/{billableProjects.length} projects
                              <svg
                                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              >
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 flex-shrink-0">All projects</span>
                          )}
                        </div>

                        {isSuper && isExpanded && (
                          <div className="px-5 pb-3 bg-slate-50/60">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 pt-2">Project Access</p>
                            {billableProjects.length === 0 ? (
                              <p className="text-xs text-slate-400 py-2">No projects yet.</p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {billableProjects.map(p => {
                                  const hasAccess = u.project_ids.includes(p.id)
                                  const key = `${u.user_id}:${p.id}`
                                  const loading = pendingToggles.has(key)
                                  return (
                                    <label key={p.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer group">
                                      <div className="relative flex-shrink-0">
                                        <input
                                          type="checkbox"
                                          checked={hasAccess}
                                          disabled={loading}
                                          onChange={() => toggleProjectAccess(u, p.id)}
                                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 cursor-pointer"
                                        />
                                      </div>
                                      <span className="text-sm text-slate-700 group-hover:text-slate-900 truncate flex-1">{p.name}</span>
                                      {loading && (
                                        <span className="text-[11px] text-slate-400 flex-shrink-0">Saving…</span>
                                      )}
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Invite user footer */}
              <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px] space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Invite User</p>
                {inviteToken && (
                  <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 space-y-2">
                    <p className="text-xs font-semibold text-emerald-800">Invitation created! Share this code:</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={inviteToken}
                        onClick={e => (e.target as HTMLInputElement).select()}
                        className="flex-1 px-2 py-1.5 bg-white border border-emerald-200 rounded-[6px] text-[11px] font-mono text-slate-700 focus:outline-none cursor-text"
                      />
                      <button onClick={() => copyToken(inviteToken)} className="btn-primary btn-sm flex-shrink-0">
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[11px] text-emerald-700">They enter this code on the "Join with Invite" screen after signing up.</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="user@company.com"
                    value={inviteEmail}
                    onChange={e => { setInviteEmail(e.target.value); setInviteError(null); setInviteToken(null) }}
                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                    className="input-base flex-1"
                  />
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as 'admin' | 'manager' | 'superintendent')}
                    className="input-base w-40"
                  >
                    <option value="superintendent">Superintendent</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={handleInvite} disabled={inviting || !orgId} className="btn-primary whitespace-nowrap">
                    {inviting ? 'Creating…' : 'Invite'}
                  </button>
                </div>
                {inviteError && <p className="text-xs text-red-500">{inviteError}</p>}
              </div>
            </div>
          )}

          {/* Subcontractors */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Subcontractors</h2>
              <p className="text-xs text-slate-400 mt-0.5">Set the default percentage of a line item's amount each subcontractor receives.</p>
            </div>

            {globalSubcontractors.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {globalSubcontractors.map(sub => (
                  <div key={sub.id}>
                    {editingId === sub.id ? (
                      <div className="px-5 py-4 bg-[#F9F8FF] space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => { setEditName(e.target.value); setEditError('') }}
                            placeholder="Name"
                            className="input-base flex-1"
                            autoFocus
                          />
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={editPct}
                              onChange={e => { setEditPct(e.target.value); setEditError('') }}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(sub.id); if (e.key === 'Escape') setEditingId(null) }}
                              className="input-base w-24 pr-7 pl-3"
                            />
                            <span className="absolute right-2.5 text-xs text-slate-400 pointer-events-none">%</span>
                          </div>
                        </div>
                        {linkedSubOrgs.length > 0 && (
                          <select value={editSubOrgId} onChange={e => setEditSubOrgId(e.target.value)} className="input-base">
                            <option value="">— No linked org —</option>
                            {linkedSubOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        )}
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {PRESET_COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => setEditColor(c)}
                                className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                                style={{ backgroundColor: c, outline: editColor === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                              />
                            ))}
                          </div>
                          <div className="ml-auto flex gap-2">
                            <button onClick={() => setEditingId(null)} className="btn-ghost btn-sm border border-slate-200">Cancel</button>
                            <button onClick={() => saveEdit(sub.id)} className="btn-primary btn-sm">Save changes</button>
                          </div>
                        </div>
                        {editError && <p className="text-xs text-red-500">{editError}</p>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                        <span className="flex-1 text-sm font-medium text-slate-800">{sub.name}</span>
                        <span className="text-sm text-slate-500 font-medium w-16 text-right">{sub.defaultPercentage}%</span>
                        <button onClick={() => startEdit(sub)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium">Edit</button>
                        <button
                          onClick={() => { if (confirm(`Delete "${sub.name}"?`)) deleteGlobalSubcontractor(sub.id) }}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">No subcontractors added yet.</p>
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px] space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Add subcontractor</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setAddError('') }}
                  className="input-base flex-1"
                />
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    value={newPct}
                    onChange={e => { setNewPct(e.target.value); setAddError('') }}
                    className="input-base w-24 pr-7 pl-3"
                  />
                  <span className="absolute right-2.5 text-xs text-slate-400 pointer-events-none">%</span>
                </div>
              </div>
              {linkedSubOrgs.length > 0 && (
                <select value={newSubOrgId} onChange={e => setNewSubOrgId(e.target.value)} className="input-base">
                  <option value="">— No linked org —</option>
                  {linkedSubOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                      style={{ backgroundColor: c, outline: newColor === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                    />
                  ))}
                </div>
                <button onClick={handleAdd} className="btn-primary btn-sm ml-auto whitespace-nowrap">
                  Add subcontractor
                </button>
              </div>
              {addError && <p className="text-xs text-red-500">{addError}</p>}
            </div>
          </div>

          {/* Job Groups */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Job Groups</h2>
              <p className="text-xs text-slate-400 mt-0.5">Create job groups that can be assigned to projects.</p>
            </div>

            {jobGroups.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {jobGroups.map(g => (
                  <div key={g.id}>
                    {editingGroupId === g.id ? (
                      <div className="px-5 py-3.5 flex items-center gap-2 bg-[#F9F8FF]">
                        <input
                          type="text"
                          value={editGroupName}
                          onChange={e => { setEditGroupName(e.target.value); setGroupEditError('') }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditGroup(g.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                          className="input-base flex-1"
                          autoFocus
                        />
                        {groupEditError && <p className="text-xs text-red-500">{groupEditError}</p>}
                        <button onClick={() => setEditingGroupId(null)} className="btn-ghost btn-sm border border-slate-200">Cancel</button>
                        <button onClick={() => saveEditGroup(g.id)} className="btn-primary btn-sm">Save</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="flex-1 text-sm font-medium text-slate-800">{g.name}</span>
                        <button onClick={() => startEditGroup(g)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium">Edit</button>
                        <button
                          onClick={() => { if (confirm(`Delete "${g.name}"?`)) deleteJobGroup(g.id) }}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">No job groups added yet.</p>
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px]">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add job group</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Job group name"
                  value={newGroupName}
                  onChange={e => { setNewGroupName(e.target.value); setGroupAddError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddGroup() }}
                  className="input-base flex-1"
                />
                <button onClick={handleAddGroup} className="btn-primary btn-sm whitespace-nowrap">
                  Add job group
                </button>
              </div>
              {groupAddError && <p className="text-xs text-red-500 mt-2">{groupAddError}</p>}
            </div>
          </div>

          {/* Superintendents */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Superintendents</h2>
              <p className="text-xs text-slate-400 mt-0.5">Create superintendents that can be assigned to projects.</p>
            </div>

            {superintendents.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {superintendents.map(su => (
                  <div key={su.id}>
                    {editingSuperId === su.id ? (
                      <div className="px-5 py-3.5 flex items-center gap-2 bg-[#F9F8FF]">
                        <input
                          type="text"
                          value={editSuperName}
                          onChange={e => { setEditSuperName(e.target.value); setSuperEditError('') }}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditSuper(su.id); if (e.key === 'Escape') setEditingSuperId(null) }}
                          className="input-base flex-1"
                          autoFocus
                        />
                        {superEditError && <p className="text-xs text-red-500">{superEditError}</p>}
                        <button onClick={() => setEditingSuperId(null)} className="btn-ghost btn-sm border border-slate-200">Cancel</button>
                        <button onClick={() => saveEditSuper(su.id)} className="btn-primary btn-sm">Save</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="flex-1 text-sm font-medium text-slate-800">{su.name}</span>
                        <button onClick={() => startEditSuper(su)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium">Edit</button>
                        <button
                          onClick={() => { if (confirm(`Delete "${su.name}"?`)) deleteSuperintendent(su.id) }}
                          className="text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">No superintendents added yet.</p>
              </div>
            )}

            <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px]">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add superintendent</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Superintendent name"
                  value={newSuperName}
                  onChange={e => { setNewSuperName(e.target.value); setSuperAddError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSuper() }}
                  className="input-base flex-1"
                />
                <button onClick={handleAddSuper} className="btn-primary btn-sm whitespace-nowrap">
                  Add superintendent
                </button>
              </div>
              {superAddError && <p className="text-xs text-red-500 mt-2">{superAddError}</p>}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
