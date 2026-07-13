import { useState, useEffect } from 'react'
import type { PurchaseOrder } from '../types'
import { fetchPurchaseOrdersForSubOrg } from '../lib/supabaseSync'
import { POCard } from './POCard'
import { updatePurchaseOrder, deletePurchaseOrder } from '../lib/supabaseSync'
import type { POStatus } from '../types'
import { useStore } from '../store/useStore'

interface Props {
  isSubUser?: boolean
  subOrgId?: string | null
  contractorOrgId?: string | null
}

export function FinancialsView({ isSubUser, subOrgId, contractorOrgId }: Props) {
  const projects = useStore(s => s.projects)
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      if (isSubUser && subOrgId) {
        const fetched = await fetchPurchaseOrdersForSubOrg(subOrgId)
        setPos(fetched)
      }
      setLoading(false)
    }
    load()
  }, [isSubUser, subOrgId, contractorOrgId])

  async function handleStatusChange(id: string, status: POStatus) {
    const ok = await updatePurchaseOrder(id, { status })
    if (ok) setPos(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  async function handleDelete(id: string) {
    const ok = await deletePurchaseOrder(id)
    if (ok) setPos(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
  }

  if (!isSubUser) {
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
              <h2 className="text-base font-semibold text-slate-800">Contractor Financial Overview</h2>
              <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
                View purchase orders per project by selecting a project from the dashboard and opening its Financials tab.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Purchase Orders</h1>
          <p className="page-subtitle">All POs assigned to your organization</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-slate-400">Loading…</p>
          </div>
        ) : pos.length === 0 ? (
          <div className="max-w-md mx-auto">
            <div className="section-card p-10 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-1">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
              </div>
              <h2 className="text-base font-semibold text-slate-800">No purchase orders yet</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Your contractor hasn't assigned any purchase orders to your organization yet.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl flex flex-col gap-3">
            {pos.map(po => {
              const project = projects.find(p => p.id === po.project_id)
              return (
                <POCard
                  key={po.id}
                  po={po}
                  projectName={project?.name}
                  lineItems={project ? project.items.filter(i => (po.lineItemIds ?? []).includes(i.id)) : undefined}
                  canChangeStatus={false}
                  canDelete={false}
                  onStatusChange={handleStatusChange}
                  onDelete={(id) => setConfirmDeleteId(id)}
                />
              )
            })}
          </div>
        )}
      </div>

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
