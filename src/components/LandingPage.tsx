import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const DOMAIN = '@proscope.app'
function toEmail(u: string) { return u.trim().toLowerCase() + DOMAIN }

const ANIM = `
  @keyframes vs-draw-ring {
    from { stroke-dashoffset: 59.69; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes vs-dot-pop {
    0%   { transform: scale(0); opacity: 0; }
    70%  { transform: scale(1.25); opacity: 1; }
    100% { transform: scale(1);   opacity: 1; }
  }
  @keyframes vs-fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`

interface Props {
  user: User | null
  onOrgCreated: () => void
}

type Tab = 'signin' | 'create' | 'invite'

export function LandingPage({ user, onOrgCreated }: Props) {
  // If already logged in, skip sign-in tab
  const defaultTab: Tab = user ? 'create' : 'signin'
  const [tab, setTab] = useState<Tab>(defaultTab)
  const { signIn, signUp } = useAuth()

  // ── Sign In state ───────────────────────────────
  const [siUsername, setSiUsername] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siError, setSiError] = useState('')
  const [siLoading, setSiLoading] = useState(false)

  // ── Create Company state ────────────────────────
  const [ccName, setCcName] = useState('')
  const [ccUsername, setCcUsername] = useState('')
  const [ccPassword, setCcPassword] = useState('')
  const [ccDisplayName, setCcDisplayName] = useState('')
  const [ccCompany, setCcCompany] = useState('')
  const [ccError, setCcError] = useState('')
  const [ccLoading, setCcLoading] = useState(false)

  // ── Join with Invite state ──────────────────────
  const [jiUsername, setJiUsername] = useState('')
  const [jiPassword, setJiPassword] = useState('')
  const [jiToken, setJiToken] = useState('')
  const [jiError, setJiError] = useState('')
  const [jiLoading, setJiLoading] = useState(false)

  function switchTab(t: Tab) {
    setTab(t)
    setSiError(''); setCcError(''); setJiError('')
  }

  // ── Handlers ────────────────────────────────────

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setSiError('')
    if (!siUsername.trim()) { setSiError('Enter your username.'); return }
    setSiLoading(true)
    const err = await signIn(toEmail(siUsername), siPassword)
    if (err) setSiError('Invalid username or password.')
    setSiLoading(false)
    // auth state change in useAuth will re-render App → org check runs
  }

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault()
    setCcError('')
    const company = ccCompany.trim()
    if (!company) { setCcError('Enter your company name.'); return }
    setCcLoading(true)
    try {
      let uid = user?.id ?? null

      // Sign up if not already logged in
      if (!uid) {
        if (!ccDisplayName.trim()) { setCcError('Enter your full name.'); setCcLoading(false); return }
        if (!ccUsername.trim()) { setCcError('Choose a username.'); setCcLoading(false); return }
        const err = await signUp(toEmail(ccUsername), ccPassword, ccDisplayName.trim())
        if (err) { setCcError(err); setCcLoading(false); return }
        // After signUp, get the session user
        const { data: { session } } = await supabase.auth.getSession()
        uid = session?.user?.id ?? null
      }

      if (!uid) { setCcError('Sign-up succeeded but could not get user ID. Please sign in.'); setCcLoading(false); return }

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name: company, type: 'contractor', created_by: uid })
        .select()
        .single()
      if (orgErr || !org) throw new Error(orgErr?.message ?? 'Failed to create organization')

      const { error: memErr } = await supabase
        .from('org_members')
        .insert({ org_id: org.id, user_id: uid, role: 'admin' })
      if (memErr) throw new Error(memErr.message)

      onOrgCreated()
    } catch (err) {
      setCcError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCcLoading(false)
    }
  }

  async function handleJoinInvite(e: React.FormEvent) {
    e.preventDefault()
    setJiError('')
    const token = jiToken.trim()
    if (!token) { setJiError('Paste your invite code.'); return }
    setJiLoading(true)
    try {
      let uid = user?.id ?? null

      // Sign in if not already logged in
      if (!uid) {
        if (!jiUsername.trim()) { setJiError('Enter your username.'); setJiLoading(false); return }
        const err = await signIn(toEmail(jiUsername), jiPassword)
        if (err) { setJiError('Invalid username or password.'); setJiLoading(false); return }
        const { data: { session } } = await supabase.auth.getSession()
        uid = session?.user?.id ?? null
      }

      if (!uid) { setJiError('Could not verify sign-in. Try again.'); setJiLoading(false); return }

      const { data: invite, error: invErr } = await supabase
        .from('invitations')
        .select('*, organizations(type)')
        .eq('token', token)
        .is('accepted_at', null)
        .maybeSingle()

      if (invErr) throw new Error(invErr.message)
      if (!invite) throw new Error('Invite code not found or already used.')
      if (new Date(invite.expires_at) < new Date()) throw new Error('This invite has expired. Ask your admin to send a new one.')

      const orgType = (invite.organizations as { type: string } | null)?.type

      if (orgType === 'contractor') {
        const { error: memErr } = await supabase
          .from('org_members')
          .insert({ org_id: invite.org_id, user_id: uid, role: invite.role, invited_by: invite.invited_by })
        if (memErr) throw new Error(memErr.message)
      } else {
        const { error: memErr } = await supabase
          .from('subcontractor_members')
          .insert({ org_id: invite.org_id, user_id: uid, role: invite.role, invited_by: invite.invited_by })
        if (memErr) throw new Error(memErr.message)
      }

      await supabase.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)
      onOrgCreated()
    } catch (err) {
      setJiError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setJiLoading(false)
    }
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
  const inputStyle = { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(206,203,246,0.25)' }
  const labelClass = "block text-xs font-medium mb-1.5"
  const labelStyle = { color: '#AFA9EC' }
  const btnStyle = { background: 'rgba(255,255,255,0.18)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }

  const tabs: { key: Tab; label: string }[] = user
    ? [{ key: 'create', label: 'Create Company' }, { key: 'invite', label: 'Join with Invite' }]
    : [{ key: 'signin', label: 'Sign In' }, { key: 'create', label: 'Create Company' }, { key: 'invite', label: 'Join with Invite' }]

  return (
    <>
      <style>{ANIM}</style>
      <div
        className="flex items-center justify-center px-4 overflow-y-auto"
        style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse 70% 55% at 50% 28%, #5248BE 0%, #3C3489 58%, #2A2472 100%)' }}
      >
        <div className="w-full max-w-sm py-10">

          {/* Animated logo */}
          <div className="flex flex-col items-center mb-8">
            <svg width="64" height="64" viewBox="0 0 36 36" role="img" aria-label="Verascope">
              <circle
                cx="18" cy="18" r="9.5"
                fill="none" stroke="#AFA9EC" strokeWidth="4" strokeDasharray="59.69"
                style={{ animation: 'vs-draw-ring 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s both' }}
              />
              <circle
                cx="18" cy="18" r="2.2" fill="#EEEDFE"
                style={{ transformOrigin: '18px 18px', animation: 'vs-dot-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.65s both' }}
              />
            </svg>
            <h1 className="text-2xl font-medium text-white mt-2 tracking-tight"
              style={{ animation: 'vs-fade-up 0.4s ease-out 0.8s both' }}>
              Verascope
            </h1>
            <p className="text-sm mt-1" style={{ color: '#AFA9EC', animation: 'vs-fade-up 0.4s ease-out 1.0s both' }}>
              Every item, verified
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(206,203,246,0.18)', animation: 'vs-fade-up 0.4s ease-out 0.9s both' }}
          >
            {/* Tab bar */}
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

              {/* ── Sign In ── */}
              {tab === 'signin' && (
                <form onSubmit={handleSignIn} className="flex flex-col gap-4">
                  <h2 className="text-base font-semibold text-white mb-1">Sign in to your account</h2>
                  {siError && <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{siError}</div>}
                  <div>
                    <label className={labelClass} style={labelStyle}>Username</label>
                    <input type="text" value={siUsername} onChange={e => setSiUsername(e.target.value)} placeholder="admin" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>Password</label>
                    <input type="password" value={siPassword} onChange={e => setSiPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className={inputClass} style={inputStyle} />
                  </div>
                  <button type="submit" disabled={siLoading} className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-1 disabled:opacity-50" style={btnStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}>
                    {siLoading ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
              )}

              {/* ── Create Company ── */}
              {tab === 'create' && (
                <form onSubmit={handleCreateCompany} className="flex flex-col gap-4">
                  <h2 className="text-base font-semibold text-white mb-1">
                    {user ? 'Set up your company' : 'Create your account & company'}
                  </h2>
                  {ccError && <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{ccError}</div>}

                  {!user && (
                    <>
                      <div>
                        <label className={labelClass} style={labelStyle}>Full Name</label>
                        <input type="text" value={ccDisplayName} onChange={e => setCcDisplayName(e.target.value)} placeholder="John Smith" className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>Username</label>
                        <input type="text" value={ccUsername} onChange={e => setCcUsername(e.target.value)} placeholder="jsmith" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>Password</label>
                        <input type="password" value={ccPassword} onChange={e => setCcPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" className={inputClass} style={inputStyle} />
                      </div>
                      <div style={{ height: 1, background: 'rgba(206,203,246,0.12)', margin: '0 -4px' }} />
                    </>
                  )}

                  <div>
                    <label className={labelClass} style={labelStyle}>Company Name</label>
                    <input type="text" value={user ? ccName : ccCompany} onChange={e => user ? setCcName(e.target.value) : setCcCompany(e.target.value)} placeholder="Acme Construction" className={inputClass} style={inputStyle} />
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(206,203,246,0.45)' }}>
                    You'll be set up as the Admin. Invite your team from settings.
                  </p>
                  <button type="submit" disabled={ccLoading} className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-1 disabled:opacity-50" style={btnStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}>
                    {ccLoading ? 'Setting up…' : user ? 'Create Company' : 'Create Account & Company'}
                  </button>
                </form>
              )}

              {/* ── Join with Invite ── */}
              {tab === 'invite' && (
                <form onSubmit={handleJoinInvite} className="flex flex-col gap-4">
                  <h2 className="text-base font-semibold text-white mb-1">Join with an invite code</h2>
                  {jiError && <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{jiError}</div>}

                  {!user && (
                    <>
                      <div>
                        <label className={labelClass} style={labelStyle}>Username</label>
                        <input type="text" value={jiUsername} onChange={e => setJiUsername(e.target.value)} placeholder="admin" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={inputClass} style={inputStyle} />
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>Password</label>
                        <input type="password" value={jiPassword} onChange={e => setJiPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className={inputClass} style={inputStyle} />
                      </div>
                      <div style={{ height: 1, background: 'rgba(206,203,246,0.12)', margin: '0 -4px' }} />
                    </>
                  )}

                  <div>
                    <label className={labelClass} style={labelStyle}>Invite Code</label>
                    <input type="text" value={jiToken} onChange={e => setJiToken(e.target.value)} placeholder="Paste your invite code here" className={`${inputClass} font-mono`} style={inputStyle} />
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(206,203,246,0.45)' }}>
                    Your admin or manager sent you this code.
                  </p>
                  <button type="submit" disabled={jiLoading} className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-1 disabled:opacity-50" style={btnStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}>
                    {jiLoading ? 'Joining…' : 'Join Organization'}
                  </button>
                </form>
              )}

              {/* Sign out link for already-logged-in users */}
              {user && (
                <p className="text-center text-xs mt-5" style={{ color: 'rgba(206,203,246,0.35)' }}>
                  Signed in as {user.email} ·{' '}
                  <button onClick={() => supabase.auth.signOut()} className="underline" style={{ color: 'rgba(206,203,246,0.55)' }}>
                    Sign out
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
