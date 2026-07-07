import { useStore } from '../store/useStore'

export function UserSettingsView() {
  const { walkPresets, setWalkPreset } = useStore()

  return (
    <div className="flex-1 overflow-auto p-6 bg-slate-50">
      <div className="max-w-lg">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">User Settings</h1>

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
      </div>
    </div>
  )
}
