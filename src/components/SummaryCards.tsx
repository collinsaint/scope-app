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
  // Removed items (both the credited-out SOW line and its credit) are excluded —
  // they net to zero and are out of scope. DRV coverage items are also excluded.
  const billable = items.filter(i => !i.isHeader && i.changeTag !== 'removed' && i.coverage?.toUpperCase() !== 'DRV')
  const completed = billable.filter(i => i.completed)
  const pending = billable.filter(i => i.pendingApproval && !i.completed)
  const totalRcv = billable.reduce((s, i) => s + i.rcv, 0)
  const completedRcv = completed.reduce((s, i) => s + i.rcv, 0)
  const remainingRcv = totalRcv - completedRcv
  // Progress counts completed + pending; bar split green/yellow
  const pctCompleted = billable.length ? completed.length / billable.length * 100 : 0
  const pctPending = billable.length ? pending.length / billable.length * 100 : 0
  const pctTotal = Math.round(pctCompleted + pctPending)

  const progressBar = (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex" style={{ minWidth: 48 }}>
        <div className="h-full bg-green-500 transition-all" style={{ width: `${pctCompleted}%` }} />
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${pctPending}%` }} />
      </div>
      <span className="text-[11px] text-slate-400">{pctTotal}%</span>
    </div>
  )

  if (isMobile) {
    return (
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        <Card compact label="Total Amount" value={fmt(totalRcv)} sub={`${billable.length} items`} />
        <Card compact label="Completed" value={fmt(completedRcv)} sub={`${pctTotal}% done`} valueColor="text-green-600" />
        <Card
          compact
          label="Progress"
          value={`${completed.length + pending.length} / ${billable.length}`}
          sub={progressBar}
        />
        <Card compact label="Remaining" value={fmt(remainingRcv)} sub={`${billable.length - completed.length} left`} valueColor={remainingRcv > 0 ? 'text-red-500' : 'text-slate-800'} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4">
      <Card label="Total Amount" value={fmt(totalRcv)} sub={`${billable.length} items`} />
      <Card label="Completed Amount" value={fmt(completedRcv)} sub={`${pctTotal}% done`} valueColor="text-green-600" />
      <Card
        label="Progress"
        value={`${completed.length + pending.length} / ${billable.length}`}
        sub={progressBar}
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
