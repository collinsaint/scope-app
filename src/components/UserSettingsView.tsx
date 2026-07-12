import { useStore } from '../store/useStore'
import { useAuth } from '../hooks/useAuth'
import type { CurrentUser } from '../types'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  superintendent: 'Superintendent',
  user: 'User',
}

interface Props {
  currentUser?: CurrentUser | null
}

export function UserSettingsView({ currentUser }: Props) {
  const { walkPresets, setWalkPreset, darkMode, setDarkMode } = useStore()
  const { user, signOut } = useAuth()

  const displayName = currentUser?.profile.display_name ?? user?.email?.replace('@proscope.app', '') ?? '—'
  const orgName = currentUser?.contractorOrg?.name ?? currentUser?.subcontractorOrg?.name ?? null
  const roleKey = currentUser?.contractorRole ?? currentUser?.subcontractorRole ?? null
  const roleLabel = roleKey ? (ROLE_LABELS[roleKey] ?? roleKey) : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="page-header">
        <div>
          <h1 className="page-title">User Settings</h1>
          {(displayName || orgName || roleLabel) && (
            <p className="page-subtitle">
              {[displayName, orgName, roleLabel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-lg flex flex-col gap-5">

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Site Visit Input Presets</h2>
              <p className="text-xs text-slate-400 mt-0.5">Quick-insert buttons shown when adding notes during a walk.</p>
            </div>
            <div className="section-card-body grid grid-cols-2 gap-3">
              {walkPresets.map((preset, i) => (
                <div key={i}>
                  <label className="label-base">Preset {i + 1}</label>
                  <input
                    type="text"
                    value={preset}
                    onChange={e => setWalkPreset(i, e.target.value)}
                    placeholder="Enter preset text…"
                    maxLength={20}
                    className="input-base"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Appearance</h2>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Dark Mode</p>
                <p className="text-xs text-slate-400 mt-0.5">Use a dark color theme throughout the app</p>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${darkMode ? 'bg-blue-600' : 'bg-slate-200'}`}
                role="switch"
                aria-checked={darkMode}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </section>

          <section className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Account</h2>
            </div>
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-700 font-medium">
                  {user?.email?.replace('@proscope.app', '') ?? '—'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Signed in</p>
              </div>
              <button onClick={signOut} className="btn-danger">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
