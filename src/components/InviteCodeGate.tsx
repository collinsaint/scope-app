import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Props {
  user: User
  onJoined: () => void
  onSignOut: () => void
}

type Tab = 'invite' | 'create'

export function InviteCodeGate({ user, onJoined, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('invite')

  const [token, setToken] = useState('')
  const [jiError, setJiError] = useState('')
  const [jiLoading, setJiLoading] = useState(false)

  const [company, setCompany] = useState('')
  const [ccError, setCcError] = useState('')
  const [ccLoading, setCcLoading] = useState(false)

  function switchTab(t: Tab) {
    setTab(t)
    setJiError('')
    setCcError('')
  }

  async function handleJoinInvite(e: React.FormEvent) {
    e.preventDefault()
    setJiError('')
    const t = token.trim()
    if (!t) { setJiError('Paste your invite code.'); return }
    setJiLoading(true)
    try {
      const { data: rows, error } = await supabase.rpc('get_invite_by_token', { invite_token: t })
      if (error) throw new Error(error.message)
      const invite = rows?.[0] ?? null
      if (!invite) throw new Error('Invite code not found or already used.')
      if (new Date(invite.expires_at) < new Date()) throw new Error('This invite has expired. Ask your admin to send a new one.')
      if (invite.email !== user.email) {
        throw new Error(`This invite was sent to ${invite.email}. Sign out and sign in with that email address.`)
      }

      if (invite.org_type === 'contractor') {
        const { error: memErr } = await supabase
          .from('org_members')
          .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role, invited_by: invite.invited_by })
        if (memErr) throw new Error(memErr.message)
      } else {
        const { error: memErr } = await supabase
          .from('subcontractor_members')
          .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role, invited_by: invite.invited_by })
        if (memErr) throw new Error(memErr.message)
      }

      await supabase.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)
      onJoined()
    } catch (err) {
      setJiError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setJiLoading(false)
    }
  }

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault()
    setCcError('')
    const name = company.trim()
    if (!name) { setCcError('Enter your company name.'); return }
    setCcLoading(true)
    try {
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name, type: 'contractor', created_by: user.id })
        .select()
        .single()
      if (orgErr || !org) throw new Error(orgErr?.message ?? 'Failed to create organization')

      const { error: memErr } = await supabase
        .from('org_members')
        .insert({ org_id: org.id, user_id: user.id, role: 'admin' })
      if (memErr) throw new Error(memErr.message)

      onJoined()
    } catch (err) {
      setCcError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCcLoading(false)
    }
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
  const inputStyle = { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(206,203,246,0.25)' }
  const labelClass = "block text-xs font-medium mb-1.5"
  const labelStyle = { color: '#AFA9EC' }
  const btnStyle = { background: 'rgba(255,255,255,0.18)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'invite', label: 'Join with Invite' },
    { key: 'create', label: 'Create Company' },
  ]

  return (
    <div
      className="flex items-center justify-center px-4 overflow-y-auto"
      style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse 70% 55% at 50% 28%, #5248BE 0%, #3C3489 58%, #2A2472 100%)' }}
    >
      <div className="w-full max-w-sm py-10">
        <div className="flex flex-col items-center mb-8">
          <svg width="64" height="64" viewBox="0 0 36 36" role="img" aria-label="Verascope">
            <circle cx="18" cy="18" r="9.5" fill="none" stroke="#AFA9EC" strokeWidth="4" />
            <circle cx="18" cy="18" r="2.2" fill="#EEEDFE" />
          </svg>
          <h1 className="text-2xl font-medium text-white mt-2 tracking-tight">Verascope</h1>
          <p className="text-sm mt-1" style={{ color: '#AFA9EC' }}>Every item, verified</p>
        </div>

        <div
          className="rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(206,203,246,0.18)' }}
        >
          <div className="flex" style={{ borderBottom: '1px solid rgba(206,203,246,0.12)' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className="flex-1 py-3 text-xs font-semibold transition-colors"
                style={{
                  color: tab === t.key ? '#EEEDFE' : 'rgba(206,203,246,0.45)',
                  borderBottom: tab === t.key ? '2px solid #AFA9EC' : '2px solid transparent',
                  background: 'transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'invite' && (
              <form onSubmit={handleJoinInvite} className="flex flex-col gap-4">
                <h2 className="text-base font-semibold text-white mb-1">Enter your invite code</h2>
                {jiError && (
                  <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                    {jiError}
                  </div>
                )}
                <div>
                  <label className={labelClass} style={labelStyle}>Invite Code</label>
                  <input
                    type="text"
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="Paste your invite code here"
                    className={`${inputClass} font-mono`}
                    style={inputStyle}
                  />
                  <p className="mt-1.5 text-[11px]" style={{ color: 'rgba(206,203,246,0.40)' }}>
                    Your invite was sent to <strong className="text-white/60">{user.email}</strong>. Make sure you're using the correct code.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={jiLoading}
                  className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  style={btnStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
                >
                  {jiLoading ? 'Joining…' : 'Join Organization'}
                </button>
              </form>
            )}

            {tab === 'create' && (
              <form onSubmit={handleCreateCompany} className="flex flex-col gap-4">
                <h2 className="text-base font-semibold text-white mb-1">Set up your company</h2>
                {ccError && (
                  <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                    {ccError}
                  </div>
                )}
                <div>
                  <label className={labelClass} style={labelStyle}>Company Name</label>
                  <input
                    type="text"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="Acme Construction"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <p className="text-xs" style={{ color: 'rgba(206,203,246,0.45)' }}>
                  You'll be set up as the Admin. Invite your team from settings.
                </p>
                <button
                  type="submit"
                  disabled={ccLoading}
                  className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  style={btnStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
                >
                  {ccLoading ? 'Setting up…' : 'Create Company'}
                </button>
              </form>
            )}

            <p className="text-center text-xs mt-5" style={{ color: 'rgba(206,203,246,0.35)' }}>
              Signed in as {user.email} ·{' '}
              <button onClick={onSignOut} className="underline" style={{ color: 'rgba(206,203,246,0.55)' }}>
                Sign out
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
