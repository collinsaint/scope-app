import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Props {
  user: User
  onComplete: () => void
}

export function OrgOnboarding({ user, onComplete }: Props) {
  const [tab, setTab] = useState<'create' | 'invite'>('create')
  const [companyName, setCompanyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateCompany() {
    const name = companyName.trim()
    if (!name) return
    setLoading(true)
    setError(null)
    try {
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name, type: 'contractor', created_by: user.id })
        .select()
        .single()
      if (orgErr || !org) throw new Error(orgErr?.message ?? 'Failed to create organization')

      const { error: memberErr } = await supabase
        .from('org_members')
        .insert({ org_id: org.id, user_id: user.id, role: 'admin' })
      if (memberErr) throw new Error(memberErr.message)

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleAcceptInvite() {
    const token = inviteCode.trim()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      // Look up the invitation
      const { data: invite, error: inviteErr } = await supabase
        .from('invitations')
        .select('*, organizations(type)')
        .eq('token', token)
        .is('accepted_at', null)
        .maybeSingle()

      if (inviteErr) throw new Error(inviteErr.message)
      if (!invite) throw new Error('Invite code not found or already used.')
      if (new Date(invite.expires_at) < new Date()) throw new Error('This invite has expired. Ask your admin to send a new one.')

      const orgType = (invite.organizations as { type: string } | null)?.type

      if (orgType === 'contractor') {
        const { error: memberErr } = await supabase
          .from('org_members')
          .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role, invited_by: invite.invited_by })
        if (memberErr) throw new Error(memberErr.message)
      } else {
        const { error: memberErr } = await supabase
          .from('subcontractor_members')
          .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role, invited_by: invite.invited_by })
        if (memberErr) throw new Error(memberErr.message)
      }

      await supabase
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id)

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex items-center justify-center px-4"
      style={{ height: '100dvh', background: 'radial-gradient(ellipse 800px 600px at 50% 30%, #1A1747 0%, #0D0B21 70%)' }}
    >
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-3 shadow-lg shadow-blue-600/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Welcome to Verascope</h1>
          <p className="text-blue-400/60 text-sm mt-1">Let's get your account set up</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7 border border-white/[0.08]"
          style={{ background: '#131029', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
        >
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <button
              onClick={() => { setTab('create'); setError(null) }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === 'create'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              Create Company
            </button>
            <button
              onClick={() => { setTab('invite'); setError(null) }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === 'invite'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              Join with Invite
            </button>
          </div>

          {tab === 'create' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateCompany()}
                  placeholder="e.g. Acme Construction"
                  className="w-full px-3 py-2.5 rounded-[9px] text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                />
              </div>
              <p className="text-xs text-white/30">
                You'll be set up as the Admin. You can invite managers, superintendents, and subcontractors from your settings.
              </p>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleCreateCompany}
                disabled={!companyName.trim() || loading}
                className="w-full py-2.5 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-40 shadow-sm shadow-blue-600/30"
                style={{ background: '#3C3489', color: 'white' }}
              >
                {loading ? 'Setting up…' : 'Create Company'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Invite Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAcceptInvite()}
                  placeholder="Paste your invite code here"
                  className="w-full px-3 py-2.5 rounded-[9px] text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-colors font-mono"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                />
              </div>
              <p className="text-xs text-white/30">
                Your admin or manager sent you an invite code. Paste it above to join their organization.
              </p>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleAcceptInvite}
                disabled={!inviteCode.trim() || loading}
                className="w-full py-2.5 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-40 shadow-sm shadow-blue-600/30"
                style={{ background: '#3C3489', color: 'white' }}
              >
                {loading ? 'Joining…' : 'Join Organization'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/20 mt-6">{user.email}</p>
      </div>
    </div>
  )
}
