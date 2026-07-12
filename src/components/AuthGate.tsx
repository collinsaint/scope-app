import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { VerascopeLoader } from './VerascopeLoader'

const DOMAIN = '@proscope.app'

function toEmail(username: string) {
  return username.trim().toLowerCase() + DOMAIN
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn, signUp, resetPassword } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <VerascopeLoader message="Loading…" />

  if (user) return <>{children}</>

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!username.trim()) { setError('Please enter a username.'); return }
    setSubmitting(true)

    const email = toEmail(username)

    if (mode === 'reset') {
      const err = await resetPassword(email)
      if (err) {
        setError('Could not send reset email. Check your username.')
      } else {
        setInfo('Password reset email sent! Check your inbox.')
        setMode('login')
      }
    } else if (mode === 'login') {
      const err = await signIn(email, password)
      if (err) setError('Invalid username or password.')
    } else {
      if (!displayName.trim()) { setError('Please enter your name.'); setSubmitting(false); return }
      const err = await signUp(email, password, displayName.trim())
      if (err) {
        setError(err)
      } else {
        setInfo('Account created! You can now sign in.')
        setMode('login')
      }
    }
    setSubmitting(false)
  }

  return (
    <>
      <style>{`
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
      `}</style>
      <div
        className="flex items-center justify-center px-4"
        style={{ height: '100dvh', background: 'radial-gradient(ellipse 70% 55% at 50% 28%, #5248BE 0%, #3C3489 58%, #2A2472 100%)' }}
      >
        <div className="w-full max-w-sm">
          {/* Animated logo lockup */}
          <div className="flex flex-col items-center mb-8">
            <svg width="64" height="64" viewBox="0 0 36 36" role="img" aria-label="Verascope">
              <circle
                cx="18" cy="18" r="9.5"
                fill="none"
                stroke="#AFA9EC"
                strokeWidth="4"
                strokeDasharray="59.69"
                style={{ animation: 'vs-draw-ring 0.6s cubic-bezier(0.4,0,0.2,1) 0.1s both' }}
              />
              <circle
                cx="18" cy="18" r="2.2"
                fill="#EEEDFE"
                style={{
                  transformOrigin: '18px 18px',
                  animation: 'vs-dot-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.65s both',
                }}
              />
            </svg>
            <h1
              className="text-2xl font-medium text-white mt-2 tracking-tight"
              style={{ animation: 'vs-fade-up 0.4s ease-out 0.8s both' }}
            >
              Verascope
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: '#AFA9EC', animation: 'vs-fade-up 0.4s ease-out 1.0s both' }}
            >
              Every item, verified
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl p-6 shadow-2xl"
            style={{
              background: 'rgba(0,0,0,0.22)',
              border: '1px solid rgba(206,203,246,0.18)',
              animation: 'vs-fade-up 0.4s ease-out 0.9s both',
            }}
          >
            <h2 className="text-base font-semibold text-white mb-5">
              {mode === 'login' ? 'Sign in to your account' : mode === 'reset' ? 'Reset your password' : 'Create an account'}
            </h2>

            {error && (
              <div className="mb-4 px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                {error}
              </div>
            )}
            {info && (
              <div className="mb-4 px-3 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }}>
                {info}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === 'reset' && (
                <p className="text-xs" style={{ color: '#AFA9EC' }}>
                  Enter your username and we'll send a password reset link to your email.
                </p>
              )}
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#AFA9EC' }}>Full Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="John Smith"
                    required
                    className="w-full px-3 py-2.5 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(206,203,246,0.25)', focusRingColor: '#AFA9EC' } as React.CSSProperties}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#AFA9EC' }}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoComplete="username"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full px-3 py-2.5 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(206,203,246,0.25)' }}
                />
              </div>

              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium" style={{ color: '#AFA9EC' }}>Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setMode('reset'); setError(''); setInfo('') }}
                        className="text-xs"
                        style={{ color: 'rgba(206,203,246,0.65)' }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full px-3 py-2.5 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(206,203,246,0.25)' }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-1 disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
              >
                {submitting ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'reset' ? 'Send Reset Link' : 'Create Account'}
              </button>
            </form>

            <div className="mt-5 text-center text-sm" style={{ color: 'rgba(206,203,246,0.55)' }}>
              {mode === 'login' ? (
                <>Don't have an account?{' '}
                  <button onClick={() => { setMode('signup'); setError(''); setInfo('') }} className="font-medium" style={{ color: '#CECBF6' }}>
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setMode('login'); setError(''); setInfo('') }} className="font-medium" style={{ color: '#CECBF6' }}>
                    Back to sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
