import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import type { Project, PurchaseOrder, PODocument } from '../types'
import { useStore } from '../store/useStore'
import { createPurchaseOrder, uploadPODocument } from '../lib/supabaseSync'
import { generatePONumber } from '../lib/generatePONumber'
import { downloadPOExcel } from '../lib/generatePOExcel'
import { useAuth } from '../hooks/useAuth'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  project: Project
  selectedItemIds: Set<string>
  existingPOs: PurchaseOrder[]
  contractorOrgId: string
  subOrgs: { id: string; name: string }[]
  onClose: () => void
  onCreated: (po: PurchaseOrder, itemIds: string[]) => void
}

interface Conflict {
  itemId: string
  description: string
  reason: string
}

export function CreatePOModal({ project, selectedItemIds, existingPOs, contractorOrgId, subOrgs, onClose, onCreated }: Props) {
  const { user } = useAuth()
  const { assignSubcontractor, assignItemsToPO } = useStore()

  // --- Conflict detection ---
  const allItems = project.items.filter(i => !i.isHeader && !i.changeTag)
  const selectedItems = allItems.filter(i => selectedItemIds.has(i.id))

  const conflicts: Conflict[] = []
  // Already in another PO
  for (const item of selectedItems) {
    if (item.purchaseOrderId) {
      const existingPO = existingPOs.find(p => p.id === item.purchaseOrderId)
      conflicts.push({ itemId: item.id, description: item.description, reason: `Already in PO ${existingPO?.poNumber ?? existingPO?.title ?? 'another PO'}` })
    }
  }

  // Detect items assigned to different subs
  const subIds = new Set(selectedItems.filter(i => i.subcontractorId).map(i => i.subcontractorId))
  if (subIds.size > 1) {
    const subMap = new Map((project.subcontractors ?? []).map(s => [s.id, s.name]))
    for (const item of selectedItems) {
      if (item.subcontractorId && subIds.size > 1) {
        conflicts.push({ itemId: item.id, description: item.description, reason: `Assigned to ${subMap.get(item.subcontractorId!) ?? 'different sub'}` })
      }
    }
  }

  const conflictIds = new Set(conflicts.map(c => c.itemId))
  const cleanItems = selectedItems.filter(i => !conflictIds.has(i.id))

  const [excludedIds, setExcludedIds] = useState<Set<string>>(conflictIds)
  const [step, setStep] = useState<'review' | 'configure' | 'confirm'>(conflicts.length > 0 ? 'review' : 'configure')
  const [subOrgId, setSubOrgId] = useState('')
  const [notes, setNotes] = useState('')
  const [pendingDocs, setPendingDocs] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const finalItems = selectedItems.filter(i => !excludedIds.has(i.id))
  const totalAmount = finalItems.reduce((s, i) => s + i.rcv, 0)
  const poNumber = generatePONumber(project, existingPOs)

  // Determine sub from items or let user pick
  const itemSubIds = new Set(finalItems.filter(i => i.subcontractorId).map(i => i.subcontractorId!))
  const inferredSubId = itemSubIds.size === 1 ? [...itemSubIds][0] : ''
  const projectSub = inferredSubId
    ? (project.subcontractors ?? []).find(s => s.id === inferredSubId)
    : null
  // Map project-level sub to org-level sub by name
  const matchedSubOrg = projectSub
    ? subOrgs.find(o => o.name.toLowerCase() === projectSub.name.toLowerCase())
    : null
  const effectiveSubOrgId = subOrgId || matchedSubOrg?.id || ''

  // Unassigned items that will be auto-assigned to the chosen sub
  const unassignedItems = finalItems.filter(i => !i.subcontractorId)

  const onDropDocs = useCallback((accepted: File[]) => {
    setPendingDocs(prev => [...prev, ...accepted])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropDocs,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
  })

  async function handleConfirm() {
    if (!user) return
    setSaving(true)
    try {
      // 1. Upload any attached documents
      const uploadedDocs: PODocument[] = []
      const tempPoId = crypto.randomUUID()
      for (const file of pendingDocs) {
        const url = await uploadPODocument(file, tempPoId)
        if (url) {
          uploadedDocs.push({ id: crypto.randomUUID(), name: file.name, url, uploadedAt: new Date().toISOString() })
        }
      }

      // 2. Create PO in Supabase
      const created = await createPurchaseOrder({
        project_id: project.id,
        contractor_org_id: contractorOrgId,
        sub_org_id: effectiveSubOrgId || null,
        title: poNumber,
        amount: totalAmount,
        notes: notes.trim() || null,
        poNumber,
        lineItemIds: finalItems.map(i => i.id),
        documents: uploadedDocs,
      }, user.id)

      if (!created) { setSaving(false); return }

      // 3. Tag scope items with this PO
      assignItemsToPO(project.id, finalItems.map(i => i.id), created.id)

      // 4. Auto-assign unassigned items to the selected sub (project-level sub lookup by org name)
      if (effectiveSubOrgId && unassignedItems.length > 0) {
        const subOrg = subOrgs.find(o => o.id === effectiveSubOrgId)
        if (subOrg) {
          const projectSubEntry = (project.subcontractors ?? []).find(s => s.name.toLowerCase() === subOrg.name.toLowerCase())
          if (projectSubEntry) {
            assignSubcontractor(project.id, unassignedItems.map(i => i.id), projectSubEntry.id)
          }
        }
      }

      // 5. Download the Excel breakdown
      downloadPOExcel(poNumber, finalItems)

      onCreated(created, finalItems.map(i => i.id))
    } finally {
      setSaving(false)
    }
  }

  // ── Step: Review conflicts ────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Review Conflicts</h2>
            <p className="text-sm text-slate-500 mt-0.5">Some items can't be included. Excluded items are highlighted below.</p>
          </div>
          <div className="flex-1 overflow-auto px-6 py-4 flex flex-col gap-2">
            {conflicts.map(c => (
              <div key={c.itemId} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <svg className="mt-0.5 flex-shrink-0 text-amber-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.description}</p>
                  <p className="text-xs text-amber-700">{c.reason}</p>
                </div>
                {!conflictIds.has(c.itemId) && (
                  <button
                    onClick={() => setExcludedIds(prev => { const s = new Set(prev); s.delete(c.itemId); return s })}
                    className="text-xs text-blue-600 hover:underline flex-shrink-0"
                  >Include</button>
                )}
              </div>
            ))}
            {cleanItems.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">{cleanItems.length} item{cleanItems.length !== 1 ? 's' : ''} will be included without conflicts.</p>
            )}
          </div>
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button
              onClick={() => setStep('configure')}
              disabled={cleanItems.length === 0}
              className="btn-primary"
            >
              Continue with {cleanItems.length} item{cleanItems.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step: Configure ───────────────────────────────────────────────────────
  if (step === 'configure') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Create Purchase Order</h2>
            <p className="text-sm text-slate-400 mt-0.5">{poNumber} &nbsp;·&nbsp; {finalItems.length} items &nbsp;·&nbsp; {fmt(totalAmount)}</p>
          </div>
          <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5">
            {/* Sub selector */}
            <div>
              <label className="label-base">Assign to Subcontractor</label>
              <select
                value={subOrgId || matchedSubOrg?.id || ''}
                onChange={e => setSubOrgId(e.target.value)}
                className="input-base"
              >
                <option value="">— Select subcontractor —</option>
                {subOrgs.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              {unassignedItems.length > 0 && effectiveSubOrgId && (
                <p className="text-xs text-blue-600 mt-1.5">
                  {unassignedItems.length} unassigned item{unassignedItems.length !== 1 ? 's' : ''} will be auto-assigned to this subcontractor.
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="label-base">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional notes for this PO…"
                className="input-base resize-none"
              />
            </div>

            {/* Document upload */}
            <div>
              <label className="label-base">Attachments</label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
              >
                <input {...getInputProps()} />
                <svg className="mx-auto mb-2 text-slate-300" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p className="text-sm text-slate-400">Drop files here or <span className="text-blue-500">browse</span></p>
                <p className="text-xs text-slate-300 mt-0.5">PDF, images, Excel, Word</p>
              </div>
              {pendingDocs.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {pendingDocs.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="flex-1 truncate">{f.name}</span>
                      <button onClick={() => setPendingDocs(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Line item summary */}
            <div>
              <label className="label-base">Items Included ({finalItems.length})</label>
              <div className="max-h-40 overflow-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                {finalItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 text-xs text-slate-600">
                    <span className="truncate flex-1 mr-2">{item.description}</span>
                    <span className="font-medium text-slate-800 flex-shrink-0">{fmt(item.rcv)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button
              onClick={() => setStep('confirm')}
              disabled={!effectiveSubOrgId}
              className="btn-primary"
            >
              Review &amp; Confirm
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step: Confirm ─────────────────────────────────────────────────────────
  const selectedSubOrg = subOrgs.find(o => o.id === effectiveSubOrgId)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Confirm Purchase Order</h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          <Row label="PO Number" value={poNumber} />
          <Row label="Subcontractor" value={selectedSubOrg?.name ?? '—'} />
          <Row label="Items" value={`${finalItems.length} line item${finalItems.length !== 1 ? 's' : ''}`} />
          <Row label="Total Amount" value={fmt(totalAmount)} bold />
          {notes && <Row label="Notes" value={notes} />}
          {pendingDocs.length > 0 && <Row label="Attachments" value={`${pendingDocs.length} file${pendingDocs.length !== 1 ? 's' : ''}`} />}
          {unassignedItems.length > 0 && effectiveSubOrgId && (
            <div className="mt-1 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              {unassignedItems.length} item{unassignedItems.length !== 1 ? 's' : ''} will be auto-assigned to {selectedSubOrg?.name}.
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">An Excel breakdown will be downloaded automatically.</p>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={() => setStep('configure')} className="btn-ghost" disabled={saving}>Back</button>
          <button onClick={handleConfirm} disabled={saving} className="btn-primary">
            {saving ? 'Creating…' : 'Create PO'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      <span className={`text-right ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{value}</span>
    </div>
  )
}
