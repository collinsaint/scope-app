import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { SubcontractorRole } from '../types'

interface CrewMember {
  id: string
  user_id: string
  role: SubcontractorRole
  email: string
  display_name: string | null
  language: 'en' | 'es'
}

export function SubcontractorSettingsView({ subOrgId, subOrgName }: { subOrgId: string; subOrgName: string }) {
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviting, setInviting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLanguage, setEditLanguage] = useState<'en' | 'es'>('en')

  async function loadCrew() {
    setLoading(true)
    try {
      const { data } = await supabase.rpc('get_sub_org_crew', { p_org_id: subOrgId })
      setCrew(
        (data ?? []).map((row: any) => ({
          id: row.member_id,
          user_id: row.user_id,
          role: row.role as SubcontractorRole,
          email: row.email ?? '',
          display_name: row.display_name ?? null,
          language: (row.language ?? 'en') as 'en' | 'es',
        }))
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCrew() }, [subOrgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) { setInviteError('Email is required.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setInviteError('Enter a valid email address.'); return }
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { invited_to_sub_org: subOrgId, invited_role: 'crew' },
      })
      if (error) {
        setInviteError(error.message)
      } else {
        setInviteSuccess(`Invite sent to ${email}`)
        setInviteEmail('')
        setTimeout(() => setInviteSuccess(''), 4000)
      }
    } finally {
      setInviting(false)
    }
  }

  async function saveLanguage(userId: string) {
    await supabase.from('profiles').update({ language: editLanguage }).eq('id', userId)
    setCrew(prev => prev.map(m => m.user_id === userId ? { ...m, language: editLanguage } : m))
    setEditingId(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="page-header">
        <div>
          <h1 className="page-title">Subcontractor Settings</h1>
          <p className="page-subtitle">{subOrgName} — Manage your crew and account preferences.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl flex flex-col gap-5">

          {/* Crew Members */}
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Crew</h2>
              <p className="text-xs text-slate-400 mt-0.5">Manage crew accounts and their settings.</p>
            </div>

            {loading ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
            ) : crew.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No crew members yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {crew.map(member => (
                  <div key={member.id}>
                    {editingId === member.id ? (
                      <div className="px-5 py-4 bg-[#F9F8FF] space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-800">{member.display_name || member.email}</p>
                            <p className="text-xs text-slate-400">{member.email}</p>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium capitalize">{member.role}</span>
                        </div>
                        <div>
                          <label className="label-base">Default Language</label>
                          <select
                            value={editLanguage}
                            onChange={e => setEditLanguage(e.target.value as 'en' | 'es')}
                            className="input-base"
                          >
                            <option value="en">English</option>
                            <option value="es">Spanish</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="btn-ghost btn-sm border border-slate-200">Cancel</button>
                          <button onClick={() => saveLanguage(member.user_id)} className="btn-primary btn-sm">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-blue-600">
                            {(member.display_name || member.email).slice(0, 1).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{member.display_name || member.email}</p>
                          <p className="text-xs text-slate-400 truncate">{member.email}</p>
                        </div>
                        <span className="text-xs text-slate-400">{member.language === 'es' ? 'Spanish' : 'English'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium capitalize">{member.role}</span>
                        <button
                          onClick={() => { setEditingId(member.id); setEditLanguage(member.language) }}
                          className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Invite crew */}
            <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px] space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Invite Crew Member</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="crew@example.com"
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  className="input-base flex-1"
                />
                <button onClick={handleInvite} disabled={inviting} className="btn-primary whitespace-nowrap">
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
              {inviteError && <p className="text-xs text-red-500">{inviteError}</p>}
              {inviteSuccess && <p className="text-xs text-green-600">{inviteSuccess}</p>}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
