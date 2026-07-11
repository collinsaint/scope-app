import { useViewMode } from '../hooks/useViewMode'
import type { ScopeItem } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  items: ScopeItem[]
}

export function SummaryCards({ items }: Props) {
  const { isMobile } = useViewMode()
  // DRV coverage items are excluded — they are not billable scope
  const billable = items.filter(i => i.coverage?.toUpperCase() !== 'DRV')
  const completed = billable.filter(i => i.completed)
  const totalRcv = billable.reduce((s, i) => s + i.rcv, 0)
  const completedRcv = completed.reduce((s, i) => s + i.rcv, 0)
  const remainingRcv = totalRcv - completedRcv
  const pct = billable.length ? Math.round(completed.length / billable.length * 100) : 0

  if (isMobile) {
    return (
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        <Card compact label="Total Amount" value={fmt(totalRcv)} sub={`${billable.length} items`} />
        <Card compact label="Completed" value={fmt(completedRcv)} sub={`${pct}% of total`} valueColor="text-green-600" />
        <Card
          compact
          label="Items complete"
          value={`${completed.length} / ${billable.length}`}
          sub={
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full" style={{ minWidth: 48 }}>
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[11px] text-slate-400">{pct}%</span>
            </div>
          }
        />
        <Card compact label="Remaining" value={fmt(remainingRcv)} sub={`${billable.length - completed.length} left`} valueColor={remainingRcv > 0 ? 'text-red-500' : 'text-slate-800'} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4">
      <Card label="Total Amount" value={fmt(totalRcv)} sub={`${billable.length} items`} />
      <Card label="Completed Amount" value={fmt(completedRcv)} sub={`${pct}% of total`} valueColor="text-green-600" />
      <Card
        label="Items complete"
        value={`${completed.length} / ${billable.length}`}
        sub={
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-slate-400">{pct}%</span>
          </div>
        }
      />
      <Card label="Remaining Amount" value={fmt(remainingRcv)} sub={`${billable.length - completed.length} items left`} valueColor={remainingRcv > 0 ? 'text-red-500' : 'text-slate-800'} />
    </div>
  )
}

function Card({ label, value, sub, valueColor = 'text-slate-900', compact = false }: {
  label: string
  value: string
  sub: React.ReactNode
  valueColor?: string
  compact?: boolean
}) {
  return (
    <div className={`card p-4 ${compact ? 'flex-shrink-0 w-44' : ''}`}>
      <p className="text-[11px] text-slate-400 mb-1">{label}</p>
      <p className={`font-semibold ${compact ? 'text-lg' : 'text-xl'} ${valueColor}`}>{value}</p>
      {typeof sub === 'string' ? <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p> : sub}
    </div>
  )
}
