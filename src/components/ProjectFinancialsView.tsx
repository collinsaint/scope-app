import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import type { Project, Subcontractor, PurchaseOrder, POStatus } from '../types'
import {
  fetchPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  fetchMyContractorSubOrgs,
  type SubOrg,
} from '../lib/supabaseSync'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const statusConfig: Record<POStatus, { label: string; pill: string }> = {
  draft:    { label: 'Draft',    pill: 'bg-slate-100 text-slate-600 border border-slate-200' },
  approved: { label: 'Approved', pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  paid:     { label: 'Paid',     pill: 'bg-blue-50 text-blue-700 border border-blue-200' },
}

interface Props {
  project: Project
  onBack: () => void
  contractorOrgId: string | null
  subOrgId: string | null
  isSubUser: boolean
  subOrgName?: string
}

interface POFormState {
  title: string
  sub_org_id: string
  amount: string
  notes: string
}

const emptyForm: POFormState = { title: '', sub_org_id: '', amount: '', notes: '' }

export function ProjectFinancialsView({ project, onBack, contractorOrgId, subOrgId, isSubUser, subOrgName }: Props) {
  const { user } = useAuth()
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<POFormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [fetchedPos, fetchedSubs] = await Promise.all([
        fetchPurchaseOrders(project.id),
        !isSubUser ? fetchMyContractorSubOrgs() : Promise.resolve([]),
      ])
      setPos(fetchedPos)
      setSubOrgs(fetchedSubs)
      setLoading(false)
    }
    load()
  }, [project.id, isSubUser])

  // Financial summary — mirrors SummaryCards: exclude headers, removed items, and DRV coverage
  const billable = project.items.filter(i => !i.isHeader && i.changeTag !== 'removed' && i.coverage?.toUpperCase() !== 'DRV')

  // For sub users: filter to only their assigned items at their percentage
  const mySubEntry = isSubUser && subOrgName
    ? (project.subcontractors ?? []).find(s => s.name.toLowerCase() === subOrgName.toLowerCase()) ?? null
    : null
  const mySubId = mySubEntry?.id ?? null
  const subPercentage = mySubEntry?.percentage ?? 100
  const subBillable = isSubUser && mySubId
    ? billable.filter(i => i.subcontractorId === mySubId)
    : billable

  const totalRcv = isSubUser
    ? subBillable.reduce((s, i) => s + i.rcv * subPercentage / 100, 0)
    : (project.scopeTotal ?? billable.reduce((s, i) => s + i.rcv, 0))
  const completedRcv = isSubUser
    ? subBillable.filter(i => i.completed).reduce((s, i) => s + i.rcv * subPercentage / 100, 0)
    : billable.filter(i => i.completed).reduce((s, i) => s + i.rcv, 0)
  const total = subBillable.length
  const completed = subBillable.filter(i => i.completed).length
  const pct = total ? Math.round(completed / total * 100) : 0

  // Scope history — one entry per uploaded Excel document, in stage order
  const ALL_STAGES = [
    { designation: 'site-visit',    label: 'Site Visit' },
    { designation: 'approved-sow',  label: 'Approved SOW' },
    { designation: 'change-order-1', label: 'Change Order 1' },
    { designation: 'change-order-2', label: 'Change Order 2' },
    { designation: 'change-order-3', label: 'Change Order 3' },
  ] as const

  const stageHistory = ALL_STAGES
    .map(({ designation, label }) => {
      const doc = (project.documents ?? []).find(
        d => d.designation === designation && d.fileType === 'excel' && d.parsedItems?.length
      )
      if (!doc) return null
      const total = doc.parsedItems!.filter(i => !i.isHeader).reduce((s, i) => s + i.rcv, 0)
      return { designation, label, total }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)

  const stageHistoryWithDelta = stageHistory.map((stage, idx) => ({
    ...stage,
    delta: idx > 0 ? stage.total - stageHistory[idx - 1].total : null,
  }))

  // By-subcontractor breakdown
  const subs: Subcontractor[] = project.subcontractors ?? []
  const subBreakdown = subs.map(sub => {
    const subItems = billable.filter(i => i.subcontractorId === sub.id)
    return {
      sub,
      rcv: subItems.reduce((s, i) => s + i.rcv, 0),
      completed: subItems.filter(i => i.completed).reduce((s, i) => s + i.rcv, 0),
      count: subItems.length,
    }
  }).filter(b => b.count > 0)

  const visiblePos = isSubUser
    ? pos.filter(po => po.sub_org_id === subOrgId)
    : pos

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function startEdit(po: PurchaseOrder) {
    setEditingId(po.id)
    setForm({
      title: po.title,
      sub_org_id: po.sub_org_id ?? '',
      amount: String(po.amount),
      notes: po.notes ?? '',
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.amount) return
    setSaving(true)
    const amount = parseFloat(form.amount) || 0
    if (editingId) {
      const ok = await updatePurchaseOrder(editingId, {
        title: form.title.trim(),
        sub_org_id: form.sub_org_id || null,
        amount,
        notes: form.notes.trim() || null,
      })
      if (ok) {
        setPos(prev => prev.map(p => p.id === editingId
          ? { ...p, title: form.title.trim(), sub_org_id: form.sub_org_id || null, amount, notes: form.notes.trim() || null }
          : p
        ))
      }
    } else {
      if (!contractorOrgId || !user) { setSaving(false); return }
      const created = await createPurchaseOrder({
        project_id: project.id,
        contractor_org_id: contractorOrgId,
        sub_org_id: form.sub_org_id || null,
        title: form.title.trim(),
        amount,
        notes: form.notes.trim() || null,
      }, user.id)
      if (created) setPos(prev => [created, ...prev])
    }
    setSaving(false)
    cancelForm()
  }

  async function handleStatusChange(id: string, status: POStatus) {
    const ok = await updatePurchaseOrder(id, { status })
    if (ok) setPos(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  async function handleDelete(id: string) {
    const ok = await deletePurchaseOrder(id)
    if (ok) setPos(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
  }

  const totalPoAmount = visiblePos.reduce((s, p) => s + p.amount, 0)
  const paidPoAmount = visiblePos.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-ghost p-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div>
            <h1 className="page-title">{project.name}</h1>
            <p className="page-subtitle">Financials</p>
          </div>
        </div>
        {!isSubUser && (
          <button onClick={startCreate} className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New PO
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 flex flex-col gap-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="section-card p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Total RCV</p>
            <p className="text-lg font-semibold text-slate-800">{fmt(totalRcv)}</p>
          </div>
          <div className="section-card p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Completed</p>
            <p className="text-lg font-semibold text-emerald-600">{fmt(completedRcv)}</p>
          </div>
          <div className="section-card p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Progress</p>
            <p className="text-lg font-semibold text-slate-800">{pct}%</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{completed}/{total} items</p>
          </div>
          <div className="section-card p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Remaining</p>
            <p className="text-lg font-semibold text-amber-600">{fmt(totalRcv - completedRcv)}</p>
          </div>
        </div>

        {/* Scope history by stage — contractor only */}
        {!isSubUser && stageHistoryWithDelta.length > 0 && (
          <div className="section-card overflow-hidden">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">Scope History</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {stageHistoryWithDelta.map(({ designation, label, total, delta }) => (
                <div key={designation} className="flex items-center justify-between px-5 py-3.5">
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <div className="flex items-center gap-3">
                    {delta !== null && (
                      <span className={`text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {delta > 0 ? '+' : ''}{delta !== 0 ? fmt(delta) : 'No change'}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-slate-900 tabular-nums w-24 text-right">{fmt(total)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By-sub breakdown — contractor only */}
        {!isSubUser && subBreakdown.length > 0 && (
          <div className="section-card overflow-hidden">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">By Subcontractor</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {subBreakdown.map(({ sub, rcv, completed: compRcv, count }) => {
                const subPct = rcv > 0 ? Math.round(compRcv / rcv * 100) : 0
                return (
                  <div key={sub.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sub.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{sub.name}</p>
                      <p className="text-[11px] text-slate-400">{count} item{count !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">{fmt(rcv)}</p>
                      <p className="text-[11px] text-emerald-600">{subPct}% done</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Purchase Orders */}
        <div className="section-card overflow-hidden">
          <div className="section-card-header flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Purchase Orders</h2>
              {visiblePos.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {fmt(paidPoAmount)} paid of {fmt(totalPoAmount)} total
                </p>
              )}
            </div>
            {!isSubUser && (
              <button onClick={startCreate} className="btn-ghost btn-sm border border-slate-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New PO
              </button>
            )}
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
          ) : visiblePos.length === 0 ? (
            <div className="px-5 py-10 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-1">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700">No purchase orders yet</p>
              {!isSubUser && (
                <p className="text-xs text-slate-400">Create a PO to track payments to subcontractors.</p>
              )}
              {isSubUser && (
                <p className="text-xs text-slate-400">Your contractor hasn't created any POs for this project yet.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visiblePos.map(po => {
                const subName = subOrgs.find(s => s.id === po.sub_org_id)?.name
                const cfg = statusConfig[po.status]
                return (
                  <div key={po.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800">{po.title}</p>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.pill}`}>
                          {cfg.label}
                        </span>
                      </div>
                      {subName && (
                        <p className="text-[11px] text-slate-400 mt-0.5">{subName}</p>
                      )}
                      {po.notes && (
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{po.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-sm font-semibold text-slate-800">{fmt(po.amount)}</p>
                      {!isSubUser && (
                        <div className="flex items-center gap-1">
                          {/* Status cycle */}
                          <select
                            value={po.status}
                            onChange={e => handleStatusChange(po.id, e.target.value as POStatus)}
                            className="text-xs border border-slate-200 rounded-[7px] px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          >
                            <option value="draft">Draft</option>
                            <option value="approved">Approved</option>
                            <option value="paid">Paid</option>
                          </select>
                          <button
                            onClick={() => startEdit(po)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(po.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* PO Create/Edit form sheet */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
          <div className="absolute inset-0 bg-black/40" onClick={cancelForm} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingId ? 'Edit Purchase Order' : 'New Purchase Order'}
              </h3>
              <button onClick={cancelForm} className="p-1 text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 pb-[calc(20px+env(safe-area-inset-bottom))] sm:pb-5">
              <div>
                <label className="label-base">Title *</label>
                <input
                  className="input-base"
                  placeholder="e.g. Roofing — Phase 1"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              {subOrgs.length > 0 && (
                <div>
                  <label className="label-base">Subcontractor</label>
                  <select
                    className="input-base"
                    value={form.sub_org_id}
                    onChange={e => setForm(f => ({ ...f, sub_org_id: e.target.value }))}
                  >
                    <option value="">No subcontractor</option>
                    {subOrgs.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label-base">Amount *</label>
                <input
                  className="input-base"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>

              <div>
                <label className="label-base">Notes</label>
                <textarea
                  className="input-base resize-none"
                  rows={2}
                  placeholder="Optional notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={cancelForm} className="btn-ghost flex-1 border border-slate-200">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !form.title.trim() || !form.amount}
                  className="btn-primary flex-1 justify-center"
                >
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create PO'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Delete this PO?</h3>
            <p className="text-sm text-slate-500">This action cannot be undone.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmDeleteId(null)} className="btn-ghost flex-1 border border-slate-200">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 px-4 py-2 rounded-[10px] bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
