export function UserSettingsView() {
  return (
    <div className="flex-1 overflow-auto p-8 bg-slate-50">
      <div className="max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">User Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your personal preferences and account settings.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-12 flex flex-col items-center justify-center text-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-600">Coming soon</p>
          <p className="text-xs text-slate-400">User settings will be available here.</p>
        </div>
      </div>
    </div>
  )
}
