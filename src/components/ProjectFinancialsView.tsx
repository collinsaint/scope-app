import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useStore } from '../store/useStore'
import type { Project, Subcontractor, PurchaseOrder, POStatus } from '../types'
import {
  fetchPurchaseOrders,
  fetchPurchaseOrdersForSubOrg,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  fetchMyContractorSubOrgs,
  syncProjectToSupabase,
  type SubOrg,
} from '../lib/supabaseSync'
import { POCard } from './POCard'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}


interface Props {
  project: Project
  onBack: () => void
  contractorOrgId: string | null
  subOrgId: string | null
  isSubUser: boolean
  isContractorAdmin: boolean
  subOrgName?: string
}

interface POFormState {
  title: string
  sub_org_id: string
  amount: string
  notes: string
}

const emptyForm: POFormState = { title: '', sub_org_id: '', amount: '', notes: '' }

export function ProjectFinancialsView({ project, onBack, contractorOrgId, subOrgId, isSubUser, isContractorAdmin, subOrgName }: Props) {
  const { user } = useAuth()
  const { setOpPercentage, assignItemsToPO } = useStore()
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<POFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [opInput, setOpInput] = useState<string>(
    project.opPercentage != null ? String(project.opPercentage) : ''
  )
  const [opSaving, setOpSaving] = useState(false)

  useEffect(() => {
    setOpInput(project.opPercentage != null ? String(project.opPercentage) : '')
  }, [project.opPercentage])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [fetchedPos, fetchedSubs] = await Promise.all([
        isSubUser && subOrgId
          ? fetchPurchaseOrdersForSubOrg(subOrgId).then(all => all.filter(po => po.project_id === project.id))
          : fetchPurchaseOrders(project.id),
        !isSubUser ? fetchMyContractorSubOrgs() : Promise.resolve([]),
      ])
      setPos(fetchedPos)
      setSubOrgs(fetchedSubs)
      setLoading(false)
    }
    load()
  }, [project.id, isSubUser])

  async function handleSaveOp() {
    const raw = opInput.trim()
    const pct = raw === '' ? undefined : parseFloat(raw)
    if (raw !== '' && (isNaN(pct!) || pct! < 0 || pct! > 100)) return
    setOpSaving(true)
    setOpPercentage(project.id, pct)
    setOpSaving(false)
  }

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

  const opMultiplier = (!isSubUser && project.opPercentage != null && project.opPercentage > 0)
    ? 1 + project.opPercentage / 100
    : 1

  const baseRcv = isSubUser
    ? subBillable.reduce((s, i) => s + i.rcv * subPercentage / 100, 0)
    : (project.scopeTotal ?? billable.reduce((s, i) => s + i.rcv, 0))
  const opAmount = baseRcv * (opMultiplier - 1)
  const totalRcv = baseRcv * opMultiplier

  const baseCompletedRcv = isSubUser
    ? subBillable.filter(i => i.completed).reduce((s, i) => s + i.rcv * subPercentage / 100, 0)
    : billable.filter(i => i.completed).reduce((s, i) => s + i.rcv, 0)
  const completedRcv = baseCompletedRcv * opMultiplier
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
      const total = doc.parsedItems!.filter(i => !i.isHeader).reduce((s, i) => s + i.rcv, 0) * opMultiplier
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
    const rawRcv = subItems.reduce((s, i) => s + i.rcv, 0)
    const rawCompleted = subItems.filter(i => i.completed).reduce((s, i) => s + i.rcv, 0)
    return {
      sub,
      rcv: rawRcv * opMultiplier,
      completed: rawCompleted * opMultiplier,
      subRcv: rawRcv * (sub.percentage ?? 100) / 100,
      count: subItems.length,
    }
  }).filter(b => b.count > 0)

  const visiblePos = isSubUser
    ? pos.filter(po => po.sub_org_id === subOrgId)
    : pos

  function startCreate() {
    setForm(emptyForm)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setForm(emptyForm)
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.amount) return
    setSaving(true)
    const amount = parseFloat(form.amount) || 0
    if (!contractorOrgId || !user) { setSaving(false); return }
    const created = await createPurchaseOrder({
      project_id: project.id,
      contractor_org_id: contractorOrgId,
      sub_org_id: form.sub_org_id || null,
      title: form.title.trim(),
      amount,
      notes: form.notes.trim() || null,
      poNumber: form.title.trim(),
      lineItemIds: [],
    }, user.id)
    if (created) setPos(prev => [created, ...prev])
    setSaving(false)
    cancelForm()
  }

  async function handleStatusChange(id: string, status: POStatus) {
    const ok = await updatePurchaseOrder(id, { status })
    if (ok) setPos(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  async function handleDelete(id: string) {
    const po = pos.find(p => p.id === id)
    const ok = await deletePurchaseOrder(id)
    if (ok) {
      if (po?.lineItemIds?.length) {
        assignItemsToPO(project.id, po.lineItemIds, null)
        const updatedProject = useStore.getState().projects.find(p => p.id === project.id)
        if (updatedProject && user) {
          await syncProjectToSupabase(updatedProject, user.id, contractorOrgId ?? undefined)
        }
      }
      setPos(prev => prev.filter(p => p.id !== id))
    }
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

      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
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

        {/* O&P percentage — contractor admins/managers only */}
        {isContractorAdmin && !isSubUser && (
          <div className="section-card">
            <div className="section-card-header flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Overhead &amp; Profit (O&amp;P)</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {project.opPercentage != null && project.opPercentage > 0
                    ? `${project.opPercentage}% applied — adds ${fmt(opAmount)} to scope total`
                    : 'Optional — leave blank if already built into the estimate'}
                </p>
              </div>
            </div>
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="relative w-36">
                <input
                  className="input-base pr-8 text-right"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0"
                  value={opInput}
                  onChange={e => setOpInput(e.target.value)}
                  onBlur={handleSaveOp}
                  onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">%</span>
              </div>
              <button
                onClick={handleSaveOp}
                disabled={opSaving}
                className="btn-primary btn-sm"
              >
                {opSaving ? 'Saving…' : 'Apply'}
              </button>
              {project.opPercentage != null && project.opPercentage > 0 && (
                <button
                  onClick={() => { setOpInput(''); setOpPercentage(project.id, undefined) }}
                  className="btn-ghost btn-sm text-slate-400"
                >
                  Clear
                </button>
              )}
            </div>
            {opAmount > 0 && (
              <div className="px-5 pb-4 flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Base scope</span>
                  <span className="tabular-nums">{fmt(baseRcv)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>O&amp;P ({project.opPercentage}%)</span>
                  <span className="tabular-nums text-emerald-600">+{fmt(opAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-slate-800 pt-1 border-t border-slate-100">
                  <span>Adjusted total</span>
                  <span className="tabular-nums">{fmt(totalRcv)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scope history by stage — contractor only */}
        {!isSubUser && stageHistoryWithDelta.length > 0 && (
          <div className="section-card">
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
          <div className="section-card">
            <div className="section-card-header">
              <h2 className="text-sm font-semibold text-slate-800">By Subcontractor</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {subBreakdown.map(({ sub, rcv, completed: compRcv, subRcv, count }) => {
                const subPct = rcv > 0 ? Math.round(compRcv / rcv * 100) : 0
                return (
                  <div key={sub.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sub.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{sub.name}</p>
                      <p className="text-[11px] text-slate-400">{count} item{count !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-400 mb-0.5">Contractor</p>
                      <p className="text-sm font-semibold text-slate-800">{fmt(rcv)}</p>
                      <p className="text-[11px] text-slate-400 mt-1.5 mb-0.5">Sub ({sub.percentage ?? 100}%)</p>
                      <p className="text-sm font-semibold text-slate-600">{fmt(subRcv)}</p>
                      <p className="text-[11px] text-emerald-600 mt-0.5">{subPct}% done</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Purchase Orders */}
        <div className="section-card">
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
            <div className="flex flex-col gap-3 p-4">
              {visiblePos.map(po => (
                <POCard
                  key={po.id}
                  po={po}
                  subName={subOrgs.find(s => s.id === po.sub_org_id)?.name}
                  lineItems={project.items.filter(i => (po.lineItemIds ?? []).includes(i.id))}
                  canChangeStatus={!isSubUser}
                  canDelete={!isSubUser}
                  onStatusChange={handleStatusChange}
                  onDelete={(id) => setConfirmDeleteId(id)}
                />
              ))}
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
              <h3 className="text-sm font-semibold text-slate-900">New Purchase Order</h3>
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
                  {saving ? 'Saving…' : 'Create PO'}
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
