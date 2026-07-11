export function FinancialsView() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="page-header">
        <div>
          <h1 className="page-title">Financials</h1>
          <p className="page-subtitle">Purchase orders and payment tracking</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-2xl">
          <div className="section-card p-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-1">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800">Purchase Orders Coming Soon</h2>
            <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
              Create and manage purchase orders for subcontractors, track scope item completion, and handle payment requests — all in one place.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
