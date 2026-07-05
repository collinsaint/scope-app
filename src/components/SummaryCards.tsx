import type { ScopeItem } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

interface Props {
  items: ScopeItem[]
}

export function SummaryCards({ items }: Props) {
  const completed = items.filter(i => i.completed)
  const totalRcv = items.reduce((s, i) => s + i.rcv, 0)
  const completedRcv = completed.reduce((s, i) => s + i.rcv, 0)
  const remainingRcv = totalRcv - completedRcv
  const pct = items.length ? Math.round(completed.length / items.length * 100) : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4">
      <Card label="Total Amount" value={fmt(totalRcv)} sub={`${items.length} items`} />
      <Card label="Completed Amount" value={fmt(completedRcv)} sub={`${pct}% of total`} valueColor="text-green-600" />
      <Card
        label="Items complete"
        value={`${completed.length} / ${items.length}`}
        sub={
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] text-slate-400">{pct}%</span>
          </div>
        }
      />
      <Card label="Remaining Amount" value={fmt(remainingRcv)} sub={`${items.length - completed.length} items left`} valueColor={remainingRcv > 0 ? 'text-red-500' : 'text-slate-800'} />
    </div>
  )
}

function Card({ label, value, sub, valueColor = 'text-slate-900' }: {
  label: string
  value: string
  sub: React.ReactNode
  valueColor?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-[11px] text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${valueColor}`}>{value}</p>
      {typeof sub === 'string' ? <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p> : sub}
    </div>
  )
}
