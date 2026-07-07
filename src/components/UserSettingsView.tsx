import { useStore } from '../store/useStore'
import { useAuth } from '../hooks/useAuth'

export function UserSettingsView() {
  const { walkPresets, setWalkPreset } = useStore()
  const { user, signOut } = useAuth()

  return (
    <div className="flex-1 overflow-auto p-6 bg-slate-50">
      <div className="max-w-lg flex flex-col gap-5">
        <h1 className="text-xl font-semibold text-slate-900">User Settings</h1>

        {/* Site Visit Input Presets */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Site Visit Input Presets</h2>
            <p className="text-xs text-slate-500 mt-0.5">Quick-insert buttons shown when adding notes during a walk.</p>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3">
            {walkPresets.map((preset, i) => (
              <div key={i}>
                <label className="block text-xs font-medium text-slate-500 mb-1">Preset {i + 1}</label>
                <input
                  type="text"
                  value={preset}
                  onChange={e => setWalkPreset(i, e.target.value)}
                  placeholder="Enter preset text…"
                  maxLength={20}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Account */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Account</h2>
          </div>
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-700 font-medium">
                {user?.email?.replace('@proscope.app', '') ?? '—'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Signed in</p>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign Out
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
