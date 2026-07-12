import { useState } from 'react'
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

type Tab = 'signin' | 'signup'

export function LandingPage() {
  const [tab, setTab] = useState<Tab>('signin')
  const [showPassword, setShowPassword] = useState(false)
  const { signIn, signUp, resetPassword } = useAuth()

  // ── Sign In ─────────────────────────────────────
  const [siInput, setSiInput] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siError, setSiError] = useState('')
  const [siLoading, setSiLoading] = useState(false)

  // ── Sign Up ─────────────────────────────────────
  const [suEmail, setSuEmail] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [suError, setSuError] = useState('')
  const [suLoading, setSuLoading] = useState(false)

  // ── Forgot Password ──────────────────────────────
  const [showReset, setShowReset] = useState(false)
  const [resetInput, setResetInput] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetInfo, setResetInfo] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setResetError(''); setResetInfo('')
    const input = resetInput.trim()
    if (!input) { setResetError('Enter your email or username.'); return }
    const email = input.includes('@') ? input.toLowerCase() : toEmail(input)
    setResetLoading(true)
    const err = await resetPassword(email)
    if (err) {
      setResetError('Could not send reset email. Check your email or username.')
    } else {
      setResetInfo('Reset link sent! Check your inbox.')
    }
    setResetLoading(false)
  }

  function switchTab(t: Tab) {
    setTab(t)
    setSiError(''); setSuError('')
    setShowReset(false); setResetError(''); setResetInfo('')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setSiError('')
    const input = siInput.trim()
    if (!input) { setSiError('Enter your email or username.'); return }
    // If input contains @, use as a full email; otherwise append domain
    const email = input.includes('@') ? input.toLowerCase() : toEmail(input)
    setSiLoading(true)
    const err = await signIn(email, siPassword)
    if (err) setSiError('Invalid email/username or password.')
    setSiLoading(false)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setSuError('')
    const email = suEmail.trim().toLowerCase()
    if (!email) { setSuError('Enter your email address.'); return }
    if (!suPassword.trim()) { setSuError('Choose a password.'); return }
    setSuLoading(true)
    const err = await signUp(email, suPassword, email.split('@')[0])
    if (err) setSuError(err)
    setSuLoading(false)
    // On success: auth state change in useAuth → App re-renders → shows InviteCodeGate
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
  const inputStyle = { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(206,203,246,0.25)' }
  const labelClass = "block text-xs font-medium mb-1.5"
  const labelStyle = { color: '#AFA9EC' }
  const btnStyle = { background: 'rgba(255,255,255,0.18)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'signin', label: 'Sign In' },
    { key: 'signup', label: 'Sign Up' },
  ]

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
              {tab === 'signin' && !showReset && (
                <form onSubmit={handleSignIn} className="flex flex-col gap-4">
                  <h2 className="text-base font-semibold text-white mb-1">Sign in to your account</h2>
                  {siError && <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{siError}</div>}
                  <div>
                    <label className={labelClass} style={labelStyle}>Email or Username</label>
                    <input type="text" value={siInput} onChange={e => setSiInput(e.target.value)} placeholder="jsmith or email@company.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className={labelClass} style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
                      <button
                        type="button"
                        onClick={() => { setShowReset(true); setResetInput(siInput); setResetError(''); setResetInfo('') }}
                        className="text-xs transition-colors"
                        style={{ color: 'rgba(206,203,246,0.55)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#CECBF6')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(206,203,246,0.55)')}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={siPassword} onChange={e => setSiPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className={inputClass} style={{ ...inputStyle, paddingRight: '2.5rem' }} />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                        style={{ color: 'rgba(206,203,246,0.45)' }}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={siLoading} className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-1 disabled:opacity-50" style={btnStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}>
                    {siLoading ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
              )}

              {/* ── Forgot Password ── */}
              {tab === 'signin' && showReset && (
                <form onSubmit={handleReset} className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      type="button"
                      onClick={() => { setShowReset(false); setResetError(''); setResetInfo('') }}
                      className="p-1 -ml-1 transition-colors"
                      style={{ color: 'rgba(206,203,246,0.55)' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                      </svg>
                    </button>
                    <h2 className="text-base font-semibold text-white">Reset your password</h2>
                  </div>
                  <p className="text-xs -mt-2" style={{ color: 'rgba(206,203,246,0.55)' }}>
                    Enter your email or username and we'll send you a reset link.
                  </p>
                  {resetError && <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{resetError}</div>}
                  {resetInfo && <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}>{resetInfo}</div>}
                  {!resetInfo && (
                    <>
                      <div>
                        <label className={labelClass} style={labelStyle}>Email or Username</label>
                        <input type="text" value={resetInput} onChange={e => setResetInput(e.target.value)} placeholder="jsmith or email@company.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={inputClass} style={inputStyle} />
                      </div>
                      <button type="submit" disabled={resetLoading} className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-1 disabled:opacity-50" style={btnStyle}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}>
                        {resetLoading ? 'Sending…' : 'Send Reset Link'}
                      </button>
                    </>
                  )}
                  {resetInfo && (
                    <button type="button" onClick={() => { setShowReset(false); setResetInfo('') }} className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors" style={btnStyle}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}>
                      Back to Sign In
                    </button>
                  )}
                </form>
              )}

              {/* ── Sign Up ── */}
              {tab === 'signup' && (
                <form onSubmit={handleSignUp} className="flex flex-col gap-4">
                  <h2 className="text-base font-semibold text-white mb-1">Create your account</h2>
                  <p className="text-xs -mt-2" style={{ color: 'rgba(206,203,246,0.50)' }}>
                    Use the email address your admin invited. After signing up, you'll enter your invite code to join your organization.
                  </p>
                  {suError && <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>{suError}</div>}
                  <div>
                    <label className={labelClass} style={labelStyle}>Email</label>
                    <input type="email" value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder="you@company.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>Password</label>
                    <input type="password" value={suPassword} onChange={e => setSuPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" className={inputClass} style={inputStyle} />
                  </div>
                  <button type="submit" disabled={suLoading} className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-1 disabled:opacity-50" style={btnStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}>
                    {suLoading ? 'Creating account…' : 'Create Account'}
                  </button>
                </form>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  )
}
