import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

type InviteRole = 'contractor-admin' | 'contractor-manager' | 'contractor-superintendent' | 'sub-manager' | 'sub-crew'

const ROLE_LABELS: Record<InviteRole, string> = {
  'contractor-admin':          'Contractor — Admin',
  'contractor-manager':        'Contractor — Manager',
  'contractor-superintendent': 'Contractor — Superintendent',
  'sub-manager':               'Subcontractor — Manager',
  'sub-crew':                  'Subcontractor — Crew',
}

function roleToDb(r: InviteRole): { orgType: 'contractor' | 'subcontractor'; dbRole: string } {
  if (r === 'sub-manager') return { orgType: 'subcontractor', dbRole: 'manager' }
  if (r === 'sub-crew')    return { orgType: 'subcontractor', dbRole: 'crew' }
  const map: Record<string, string> = {
    'contractor-admin':          'admin',
    'contractor-manager':        'manager',
    'contractor-superintendent': 'superintendent',
  }
  return { orgType: 'contractor', dbRole: map[r] }
}

interface Invite {
  id: string
  email: string
  role: string
  token: string
  created_at: string
  accepted_at: string | null
  expires_at: string
  organizations: { name: string; type: string } | null
}

interface ProjectRow {
  id: string
  name: string
  address: string | null
  owner_id: string
  created_at: string
  data: { projectStatus?: string; items?: { length: number }[] } | null
}

interface OrgOption {
  id: string
  name: string
  type: string
}

export function AdminPortalView() {
  const [tab, setTab] = useState<'invite' | 'projects' | 'invitations'>('invite')

  // ── Invite form ──────────────────────────────────────────────
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('contractor-admin')
  const [existingOrgs, setExistingOrgs] = useState<OrgOption[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>('new')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [lastToken, setLastToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // ── Invitations list ─────────────────────────────────────────
  const [invites, setInvites] = useState<Invite[]>([])
  const [invitesLoading, setInvitesLoading] = useState(true)

  // ── All projects ─────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState('')

  const { orgType } = roleToDb(role)

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true)
    const { data } = await supabase
      .from('invitations')
      .select('id, email, role, token, created_at, accepted_at, expires_at, organizations(name, type)')
      .order('created_at', { ascending: false })
      .limit(100)
    setInvites((data as unknown as Invite[]) ?? [])
    setInvitesLoading(false)
  }, [])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    setProjectsError('')
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, address, owner_id, created_at, data')
      .order('created_at', { ascending: false })
    if (error) {
      setProjectsError('Could not load projects. Make sure admin_policies.sql has been run in the Supabase SQL editor.')
    } else {
      setProjects((data as ProjectRow[]) ?? [])
    }
    setProjectsLoading(false)
  }, [])

  const loadOrgs = useCallback(async (type: 'contractor' | 'subcontractor') => {
    const { data } = await supabase
      .from('organizations')
      .select('id, name, type')
      .eq('type', type)
      .order('name')
    setExistingOrgs((data as OrgOption[]) ?? [])
    setSelectedOrgId('new')
  }, [])

  useEffect(() => {
    loadInvites()
    loadProjects()
  }, [loadInvites, loadProjects])

  useEffect(() => {
    loadOrgs(orgType)
  }, [orgType, loadOrgs])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const company = companyName.trim()
    const emailTrimmed = email.trim().toLowerCase()
    if (!emailTrimmed) { setInviteError('Email is required.'); return }
    if (selectedOrgId === 'new' && !company) { setInviteError('Company name is required for a new organization.'); return }

    setInviteLoading(true)
    setInviteError('')
    setLastToken(null)
    try {
      const { orgType: ot, dbRole } = roleToDb(role)

      let orgId: string
      if (selectedOrgId !== 'new') {
        orgId = selectedOrgId
      } else {
        // Check if org with this name already exists
        const { data: existing } = await supabase
          .from('organizations')
          .select('id')
          .eq('name', company)
          .eq('type', ot)
          .maybeSingle()

        if (existing) {
          orgId = existing.id
        } else {
          const { data: newOrg, error: orgErr } = await supabase
            .from('organizations')
            .insert({ name: company, type: ot })
            .select('id')
            .single()
          if (orgErr || !newOrg) throw new Error(orgErr?.message ?? 'Failed to create organization')
          orgId = newOrg.id
        }
      }

      const { data: inv, error: invErr } = await supabase
        .from('invitations')
        .insert({ email: emailTrimmed, org_id: orgId, role: dbRole })
        .select('token')
        .single()
      if (invErr || !inv) throw new Error(invErr?.message ?? 'Failed to create invitation')

      setLastToken(inv.token)
      setCompanyName('')
      setContactName('')
      setEmail('')
      await loadInvites()
      await loadOrgs(orgType)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleRevokeInvite(id: string) {
    if (!confirm('Revoke this invitation?')) return
    await supabase.from('invitations').delete().eq('id', id)
    loadInvites()
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const pendingInvites = invites.filter(i => !i.accepted_at)
  const acceptedInvites = invites.filter(i => i.accepted_at)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Portal</h1>
          <p className="page-subtitle">Platform management — developer access only</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 border-b border-slate-100 bg-white flex-shrink-0">
        {([['invite', 'Invite Users'], ['projects', 'All Projects'], ['invitations', 'Invitations']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            {id === 'invitations' && pendingInvites.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                {pendingInvites.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">

        {/* ── INVITE TAB ── */}
        {tab === 'invite' && (
          <div className="max-w-lg space-y-5">

            {/* Success token */}
            {lastToken && (
              <div className="section-card p-5 border-emerald-200 bg-emerald-50">
                <div className="flex items-start gap-3">
                  <svg className="text-emerald-600 flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-emerald-800 mb-1">Invitation created!</p>
                    <p className="text-xs text-emerald-700 mb-3">Share this invite code with the user. They'll enter it on the "Join with Invite" tab.</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-[8px] text-xs font-mono text-slate-700 truncate">
                        {lastToken}
                      </code>
                      <button
                        onClick={() => copyToken(lastToken)}
                        className="btn-primary btn-sm flex-shrink-0"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="section-card">
              <div className="section-card-header">
                <h2 className="text-sm font-semibold text-slate-800">Invite a User</h2>
                <p className="text-xs text-slate-400 mt-0.5">Creates an invitation token the user enters when signing up.</p>
              </div>
              <form onSubmit={handleInvite} className="section-card-body space-y-4">

                <div>
                  <label className="label-base">Role</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as InviteRole)}
                    className="input-base"
                  >
                    {(Object.entries(ROLE_LABELS) as [InviteRole, string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label-base">Organization</label>
                  <select
                    value={selectedOrgId}
                    onChange={e => setSelectedOrgId(e.target.value)}
                    className="input-base"
                  >
                    <option value="new">+ Create new {orgType === 'contractor' ? 'contractor' : 'subcontractor'} company</option>
                    {existingOrgs.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                {selectedOrgId === 'new' && (
                  <div>
                    <label className="label-base">Company Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="e.g. Acme Construction"
                      className="input-base"
                    />
                  </div>
                )}

                <div>
                  <label className="label-base">Contact Name</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    placeholder="e.g. Jane Smith"
                    className="input-base"
                  />
                </div>

                <div>
                  <label className="label-base">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@company.com"
                    className="input-base"
                    required
                  />
                </div>

                {inviteError && <p className="text-xs text-red-500">{inviteError}</p>}

                <button type="submit" disabled={inviteLoading} className="btn-primary w-full justify-center">
                  {inviteLoading ? 'Creating invitation…' : 'Create Invitation'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── PROJECTS TAB ── */}
        {tab === 'projects' && (
          <div className="space-y-4">
            {projectsLoading ? (
              <div className="flex items-center gap-2 py-12 justify-center text-slate-400 text-sm">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/>
                </svg>
                Loading all projects…
              </div>
            ) : projectsError ? (
              <div className="section-card p-6 max-w-lg">
                <div className="flex gap-3">
                  <svg className="text-amber-500 flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 mb-1">Admin policies not applied</p>
                    <p className="text-xs text-slate-500 mb-3">{projectsError}</p>
                    <p className="text-xs text-slate-500">Run <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">supabase/admin_policies.sql</code> in the Supabase SQL Editor, then refresh.</p>
                  </div>
                </div>
              </div>
            ) : projects.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No projects found.</div>
            ) : (
              <>
                <p className="text-xs text-slate-400">{projects.length} project{projects.length !== 1 ? 's' : ''} across all accounts</p>
                <div className="section-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Project</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Address</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Items</th>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projects.map(p => {
                        const items = (p.data as { items?: unknown[] } | null)?.items ?? []
                        const dataItems = items.filter((i: unknown) => !(i as { isHeader?: boolean }).isHeader)
                        const completed = dataItems.filter((i: unknown) => (i as { completed?: boolean }).completed).length
                        const pct = dataItems.length ? Math.round(completed / dataItems.length * 100) : 0
                        const status = (p.data as { projectStatus?: string } | null)?.projectStatus

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5">
                              <p className="font-medium text-slate-800 truncate max-w-[200px]">{p.name}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px] sm:hidden">{p.address ?? '—'}</p>
                            </td>
                            <td className="px-5 py-3.5 hidden sm:table-cell">
                              <p className="text-slate-500 truncate max-w-[180px]">{p.address ?? '—'}</p>
                            </td>
                            <td className="px-5 py-3.5">
                              {status ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-slate-50 border-slate-200 text-slate-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                  {status}
                                </span>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 hidden md:table-cell">
                              {dataItems.length > 0 ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 text-xs">{completed}/{dataItems.length}</span>
                                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[11px] text-slate-400">{pct}%</span>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 hidden lg:table-cell">
                              <span className="text-slate-400 text-xs">
                                {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── INVITATIONS TAB ── */}
        {tab === 'invitations' && (
          <div className="max-w-2xl space-y-5">
            {invitesLoading ? (
              <div className="flex items-center gap-2 py-12 justify-center text-slate-400 text-sm">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/>
                </svg>
                Loading invitations…
              </div>
            ) : invites.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No invitations yet.</div>
            ) : (
              <>
                {pendingInvites.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Pending ({pendingInvites.length})</p>
                    <div className="section-card divide-y divide-slate-100">
                      {pendingInvites.map(inv => (
                        <InviteRow key={inv.id} inv={inv} onCopy={copyToken} onRevoke={handleRevokeInvite} copied={copied} />
                      ))}
                    </div>
                  </div>
                )}
                {acceptedInvites.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Accepted ({acceptedInvites.length})</p>
                    <div className="section-card divide-y divide-slate-100">
                      {acceptedInvites.map(inv => (
                        <InviteRow key={inv.id} inv={inv} onCopy={copyToken} onRevoke={handleRevokeInvite} copied={copied} accepted />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

function InviteRow({ inv, onCopy, onRevoke, copied, accepted = false }: {
  inv: Invite
  onCopy: (token: string) => void
  onRevoke: (id: string) => void
  copied: boolean
  accepted?: boolean
}) {
  const expired = !accepted && new Date(inv.expires_at) < new Date()

  return (
    <div className="px-5 py-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-800">{inv.email}</p>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            accepted
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : expired
              ? 'bg-red-50 border-red-200 text-red-600'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {accepted ? 'Accepted' : expired ? 'Expired' : 'Pending'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {inv.organizations && (
            <span className="text-xs text-slate-400">{inv.organizations.name} · {inv.organizations.type}</span>
          )}
          <span className="text-xs text-slate-400">Role: {inv.role}</span>
          {accepted && inv.accepted_at && (
            <span className="text-xs text-slate-400">
              Accepted {new Date(inv.accepted_at).toLocaleDateString()}
            </span>
          )}
          {!accepted && (
            <span className="text-xs text-slate-400">
              Expires {new Date(inv.expires_at).toLocaleDateString()}
            </span>
          )}
        </div>
        {!accepted && (
          <code className="mt-1.5 block text-[11px] font-mono text-slate-500 truncate">{inv.token}</code>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {!accepted && (
          <button
            onClick={() => onCopy(inv.token)}
            className="btn-ghost btn-sm border border-slate-200"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
        {!accepted && (
          <button
            onClick={() => onRevoke(inv.id)}
            className="text-slate-300 hover:text-red-400 transition-colors p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
