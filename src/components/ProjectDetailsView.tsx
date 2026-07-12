import { useState, useRef, useEffect } from 'react'
import type { Project, SketchLabel } from '../types'
import { SKETCH_LABELS } from '../types'
import { useStore } from '../store/useStore'
import { resetDemoProject } from '../lib/seedDemoProject'
import { grantProjectAccessToSubOrg, revokeProjectAccessForSubOrg, fetchMyContractorSubOrgs, type SubOrg } from '../lib/supabaseSync'
import { supabase } from '../lib/supabase'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  project: Project
  canManage?: boolean
  isSubUser?: boolean
}

export function ProjectDetailsView({ project, canManage = false, isSubUser = false }: Props) {
  const { updateProjectDetails, jobGroups, superintendents, addSketch, removeSketch, setSpanishMode,
    globalSubcontractors, addSubcontractor, deleteSubcontractor, updateProjectSubcontractor } = useStore()
  const sketches = project.sketches ?? []
  const usedLabels = new Set(sketches.map(s => s.label))
  const availableLabels = SKETCH_LABELS.filter(l => !usedLabels.has(l))
  const [sketchLabel, setSketchLabel] = useState<SketchLabel>(availableLabels[0] ?? SKETCH_LABELS[0])
  const [sketchUploading, setSketchUploading] = useState(false)
  const sketchInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(project.name)
  const [address, setAddress] = useState(project.address)
  const [projectCode, setProjectCode] = useState(project.projectCode ?? '')
  const [superintendent, setSuperintendent] = useState(project.superintendent ?? '')
  const [projectStatus, setProjectStatus] = useState(project.projectStatus ?? 'Site Visit')
  const [jobGroup, setJobGroup] = useState(project.jobGroup ?? '')
  const [applicantName, setApplicantName] = useState(project.applicantName ?? '')
  const [applicantPhone, setApplicantPhone] = useState(project.applicantPhone ?? '')
  const [applicantEmail, setApplicantEmail] = useState(project.applicantEmail ?? '')
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [pctDraft, setPctDraft] = useState<Record<string, string>>({})
  const [selectedGlobalId, setSelectedGlobalId] = useState('')
  const [linkedSubOrgs, setLinkedSubOrgs] = useState<SubOrg[]>([])
  const [confirmRemoveSubId, setConfirmRemoveSubId] = useState<string | null>(null)

  useEffect(() => {
    fetchMyContractorSubOrgs().then(setLinkedSubOrgs)
  }, [])

  const dataItems = project.items.filter(i => !i.isHeader)
  const completed = dataItems.filter(i => i.completed)
  const totalAmount = dataItems.reduce((s, i) => s + i.rcv, 0)
  const completedAmount = completed.reduce((s, i) => s + i.rcv, 0)
  const remainingAmount = totalAmount - completedAmount
  const pct = dataItems.length ? Math.round(completed.length / dataItems.length * 100) : 0
  const subcontractors = project.subcontractors ?? []
  const unassignedGlobals = globalSubcontractors.filter(g => !subcontractors.some(s => s.id === g.id))

  function resolveSubOrgId(globalName: string, explicitSubOrgId?: string): string | undefined {
    if (explicitSubOrgId) return explicitSubOrgId
    return linkedSubOrgs.find(o => o.name.toLowerCase() === globalName.toLowerCase())?.id
  }

  async function handleAddSubcontractor() {
    const global = globalSubcontractors.find(g => g.id === selectedGlobalId)
    if (!global) return
    addSubcontractor(project.id, {
      id: global.id,
      name: global.name,
      color: global.color,
      percentage: global.defaultPercentage > 0 ? global.defaultPercentage : undefined,
    })
    setSelectedGlobalId('')
    const subOrgId = resolveSubOrgId(global.name, global.subOrgId)
    if (subOrgId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) grantProjectAccessToSubOrg(project.id, subOrgId, user.id)
    }
  }

  async function handleRemoveSubcontractor(subId: string) {
    deleteSubcontractor(project.id, subId)
    const global = globalSubcontractors.find(g => g.id === subId)
    if (global) {
      const subOrgId = resolveSubOrgId(global.name, global.subOrgId)
      if (subOrgId) revokeProjectAccessForSubOrg(project.id, subOrgId)
    }
    setConfirmRemoveSubId(null)
  }

  function commitPct(subId: string) {
    const raw = pctDraft[subId]
    if (raw === undefined) return
    const val = parseFloat(raw)
    updateProjectSubcontractor(project.id, subId, { percentage: isNaN(val) || raw.trim() === '' ? undefined : val })
    setPctDraft(d => { const n = { ...d }; delete n[subId]; return n })
  }
  const commentCount = dataItems.filter(i => i.comment).length
  const rooms = [...new Set(dataItems.map(i => i.room))]

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    updateProjectDetails(project.id, {
      name: trimmedName,
      address: address.trim(),
      projectCode: projectCode.trim() || undefined,
      superintendent: superintendent.trim() || undefined,
      projectStatus: projectStatus || undefined,
      jobGroup: jobGroup.trim() || undefined,
      applicantName: applicantName.trim() || undefined,
      applicantPhone: applicantPhone.trim() || undefined,
      applicantEmail: applicantEmail.trim() || undefined,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isDirty =
    name.trim() !== project.name ||
    address.trim() !== project.address ||
    projectCode.trim() !== (project.projectCode ?? '') ||
    superintendent.trim() !== (project.superintendent ?? '') ||
    projectStatus !== (project.projectStatus ?? '') ||
    jobGroup.trim() !== (project.jobGroup ?? '') ||
    applicantName.trim() !== (project.applicantName ?? '') ||
    applicantPhone.trim() !== (project.applicantPhone ?? '') ||
    applicantEmail.trim() !== (project.applicantEmail ?? '')

  async function handleReset() {
    setResetting(true)
    try {
      await resetDemoProject()
    } finally {
      setResetting(false)
      setResetConfirm(false)
    }
  }

  if (isSubUser) {
    return (
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-3xl space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            {/* Project Info — read-only */}
            <div className="section-card p-5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Project Info</h2>
              <div className="space-y-3">
                <div>
                  <p className="label-base">Project Name</p>
                  <p className="text-sm font-medium text-slate-800">{project.name || '—'}</p>
                </div>
                <div>
                  <p className="label-base">Address</p>
                  <p className="text-sm font-medium text-slate-800">{project.address || '—'}</p>
                </div>
                <div>
                  <p className="label-base">Superintendent</p>
                  <p className="text-sm font-medium text-slate-800">{project.superintendent || '—'}</p>
                </div>
              </div>
            </div>

            {/* Applicant Info — read-only */}
            <div className="section-card p-5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Applicant Info</h2>
              <div className="space-y-3">
                <div>
                  <p className="label-base">Applicant Name</p>
                  <p className="text-sm font-medium text-slate-800">{project.applicantName || '—'}</p>
                </div>
                <div>
                  <p className="label-base">Applicant Phone #</p>
                  <p className="text-sm font-medium text-slate-800">{project.applicantPhone || '—'}</p>
                </div>
                <div>
                  <p className="label-base">Applicant Email</p>
                  <p className="text-sm font-medium text-slate-800">{project.applicantEmail || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Display Options */}
          <div className="section-card p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Display Options</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Spanish Mode</p>
                <p className="text-xs text-slate-400 mt-0.5">Translate line item descriptions to Spanish</p>
              </div>
              <button
                onClick={() => setSpanishMode(project.id, !(project.spanishMode ?? false))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${project.spanishMode ? 'bg-blue-600' : 'bg-slate-200'}`}
                role="switch"
                aria-checked={project.spanishMode ?? false}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${project.spanishMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      <div className="max-w-5xl space-y-5">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">

          {/* Project Info */}
          <div className="section-card p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Project Info</h2>
            <div className="space-y-4">
              <div>
                <label className="label-base">Project Name</label>
                <input type="text" value={name} onChange={e => { setName(e.target.value); setSaved(false) }} className="input-base" />
              </div>
              <div>
                <label className="label-base">Address</label>
                <input type="text" value={address} onChange={e => { setAddress(e.target.value); setSaved(false) }} placeholder="No address" className="input-base" />
              </div>
              <div>
                <label className="label-base">Project ID</label>
                <input type="text" value={projectCode} onChange={e => { setProjectCode(e.target.value); setSaved(false) }} placeholder="—" className="input-base" />
              </div>
              <div>
                <label className="label-base">Job Group</label>
                <select value={jobGroup} onChange={e => { setJobGroup(e.target.value); setSaved(false) }} className="input-base">
                  <option value="">— None —</option>
                  {jobGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
                {jobGroups.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">No job groups yet — add them in Contractor Settings.</p>
                )}
              </div>
              <div>
                <label className="label-base">Superintendent</label>
                <select value={superintendent} onChange={e => { setSuperintendent(e.target.value); setSaved(false) }} className="input-base">
                  <option value="">— None —</option>
                  {superintendents.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                {superintendents.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">No superintendents yet — add them in Contractor Settings.</p>
                )}
              </div>
              <div>
                <label className="label-base">Project Status</label>
                <select value={projectStatus} onChange={e => { setProjectStatus(e.target.value); setSaved(false) }} className="input-base">
                  <option value="">— None —</option>
                  <option value="Site Visit">Site Visit</option>
                  <option value="Pre-Construction">Pre-Construction</option>
                  <option value="Work in Progress">Work in Progress</option>
                  <option value="Warranty">Warranty</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Applicant Info */}
          <div className="section-card p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Applicant Info</h2>
            <div className="space-y-4">
              <div>
                <label className="label-base">Applicant Name</label>
                <input type="text" value={applicantName} onChange={e => { setApplicantName(e.target.value); setSaved(false) }} placeholder="—" className="input-base" />
              </div>
              <div>
                <label className="label-base">Applicant Phone #</label>
                <input type="tel" value={applicantPhone} onChange={e => { setApplicantPhone(e.target.value); setSaved(false) }} placeholder="—" className="input-base" />
              </div>
              <div>
                <label className="label-base">Applicant Email</label>
                <input type="email" value={applicantEmail} onChange={e => { setApplicantEmail(e.target.value); setSaved(false) }} placeholder="—" className="input-base" />
              </div>
            </div>
          </div>

        </div>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className={isDirty ? 'btn-primary' : 'btn-primary opacity-40 cursor-not-allowed'}
          >
            Save changes
          </button>
          {saved && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Saved
            </span>
          )}
        </div>

        {/* Display Options */}
        <div className="section-card p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Display Options</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Spanish Mode</p>
              <p className="text-xs text-slate-400 mt-0.5">Translate line item descriptions to Spanish</p>
            </div>
            <button
              onClick={() => setSpanishMode(project.id, !(project.spanishMode ?? false))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${project.spanishMode ? 'bg-blue-600' : 'bg-slate-200'}`}
              role="switch"
              aria-checked={project.spanishMode ?? false}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${project.spanishMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Financial summary */}
        <div className="section-card p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Financial Summary</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Total Amount</p>
              <p className="text-base font-semibold text-slate-900">{fmt(totalAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Completed Amount</p>
              <p className="text-base font-semibold text-emerald-600">{fmt(completedAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Remaining Amount</p>
              <p className={`text-base font-semibold ${remainingAmount > 0 ? 'text-red-500' : 'text-slate-900'}`}>{fmt(remainingAmount)}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">{completed.length} of {dataItems.length} items complete</span>
              <span className="text-xs font-semibold text-slate-600">{pct}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Scope details */}
        <div className="section-card p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Scope Details</h2>
          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
            <Detail label="Source File" value={project.fileName} />
            <Detail label="Created" value={new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} />
            <Detail label="Line Items" value={`${dataItems.length} items across ${rooms.length} room${rooms.length !== 1 ? 's' : ''}`} />
            <Detail label="Subcontractors" value={subcontractors.length > 0 ? subcontractors.map(s => s.name).join(', ') : 'None assigned'} />
            <Detail label="Comments" value={commentCount > 0 ? `${commentCount} item${commentCount !== 1 ? 's' : ''} with comments` : 'No comments'} />
            <Detail label="Photos" value={(() => { const n = dataItems.reduce((s, i) => s + i.photos.length, 0); return n > 0 ? `${n} photo${n !== 1 ? 's' : ''} uploaded` : 'No photos' })()} />
          </div>
        </div>

        {/* Project Sketches */}
        <div className="section-card p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-1">Project Sketches</h2>
          <p className="text-xs text-slate-400 mb-4">Upload up to 3 PDF or image files. Each must have a unique level name.</p>

          {sketches.length > 0 && (
            <div className="space-y-2 mb-4">
              {SKETCH_LABELS.filter(l => usedLabels.has(l)).map(label => {
                const sk = sketches.find(s => s.label === label)!
                return (
                  <div key={label} className="flex items-center gap-3 px-4 py-3 bg-blue-50/60 border border-blue-100 rounded-[9px]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="text-xs font-semibold text-slate-700 w-24 flex-shrink-0">{label}</span>
                    <span className="text-xs text-slate-400 flex-1 truncate">{sk.fileName}</span>
                    <button onClick={() => removeSketch(project.id, label)} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {availableLabels.length > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={sketchLabel}
                onChange={e => setSketchLabel(e.target.value as SketchLabel)}
                className="input-base w-auto"
              >
                {availableLabels.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button
                onClick={() => sketchInputRef.current?.click()}
                disabled={sketchUploading}
                className="btn-primary"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {sketchUploading ? 'Uploading…' : 'Upload File'}
              </button>
              <input
                ref={sketchInputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setSketchUploading(true)
                  const reader = new FileReader()
                  reader.onload = ev => {
                    const data = ev.target?.result as string
                    addSketch(project.id, { label: sketchLabel, data, fileName: file.name })
                    setSketchUploading(false)
                    const remaining = availableLabels.filter(l => l !== sketchLabel)
                    if (remaining.length > 0) setSketchLabel(remaining[0])
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }}
              />
            </div>
          ) : (
            <p className="text-xs text-slate-400">All three sketch slots are filled.</p>
          )}
        </div>

        {/* Project Subcontractors */}
        <div className="section-card overflow-hidden">
          <div className="section-card-header">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em]">Project Subcontractors</h2>
            <p className="text-xs text-slate-400 mt-0.5">Subcontractors assigned here can be assigned to line items in the scope.</p>
          </div>
          {subcontractors.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {subcontractors.map(sub => (
                <div key={sub.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                  <span className="text-sm font-medium text-slate-800 flex-1">{sub.name}</span>
                  {canManage ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min="0" max="100" step="0.1"
                          value={sub.id in pctDraft ? pctDraft[sub.id] : (sub.percentage ?? '')}
                          onChange={e => setPctDraft(d => ({ ...d, [sub.id]: e.target.value }))}
                          onBlur={() => commitPct(sub.id)}
                          onKeyDown={e => e.key === 'Enter' && commitPct(sub.id)}
                          placeholder="—"
                          className="w-16 px-2 py-1 text-xs border border-slate-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <button onClick={() => setConfirmRemoveSubId(sub.id)} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </>
                  ) : (
                    sub.percentage != null && <span className="text-xs text-slate-500">{sub.percentage}%</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-slate-400">No subcontractors assigned to this project yet.</p>
            </div>
          )}
          {canManage && (
            <div className="px-5 py-4 border-t border-slate-100 bg-[#F9F8FF] rounded-b-[14px]">
              {globalSubcontractors.length === 0 ? (
                <p className="text-xs text-slate-400">No subcontractors configured yet — add them in Contractor Settings.</p>
              ) : unassignedGlobals.length === 0 ? (
                <p className="text-xs text-slate-400">All configured subcontractors have been assigned to this project.</p>
              ) : (
                <div className="flex gap-2">
                  <select value={selectedGlobalId} onChange={e => setSelectedGlobalId(e.target.value)} className="input-base flex-1">
                    <option value="">Select subcontractor…</option>
                    {unassignedGlobals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <button onClick={handleAddSubcontractor} disabled={!selectedGlobalId} className="btn-primary">Add</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rooms */}
        <div className="section-card p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Rooms / Areas ({rooms.length})</h2>
          <div className="flex flex-wrap gap-2">
            {rooms.map(r => {
              const roomItems = dataItems.filter(i => i.room === r)
              const roomDone = roomItems.filter(i => i.completed).length
              const roomPct = roomItems.length ? Math.round(roomDone / roomItems.length * 100) : 0
              return (
                <div key={r} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/60 border border-blue-100 rounded-[9px]">
                  <span className="text-xs font-medium text-slate-700">{r}</span>
                  <span className="text-[10px] text-slate-400">{roomItems.length} items</span>
                  {roomPct > 0 && (
                    <span className={`text-[10px] font-semibold ${roomPct === 100 ? 'text-emerald-500' : 'text-blue-500'}`}>{roomPct}%</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Database storage */}
        {(() => {
          const bytes = new TextEncoder().encode(JSON.stringify(project)).length
          const kb = bytes / 1024
          const display = kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`
          return (
            <div className="section-card p-5">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.12em] mb-4">Database Storage</h2>
              <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                <Detail label="Project Size" value={display} />
                <Detail label="Raw Size" value={`${bytes.toLocaleString()} bytes`} />
              </div>
            </div>
          )
        })()}

        {/* Demo reset */}
        {project.isDemo && (
          <div className="bg-amber-50 border border-amber-200 rounded-[14px] p-5">
            <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-[0.12em] mb-1">Demo Project</h2>
            <p className="text-xs text-amber-700/70 mb-4">
              Reset this demo back to its original state. All walk overrides, notes, photos, and custom rooms will be cleared.
            </p>
            {resetConfirm ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-amber-800 font-medium">All changes will be lost. Continue?</span>
                <button onClick={() => setResetConfirm(false)} className="btn-ghost btn-sm border border-slate-200">Cancel</button>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-[8px] font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {resetting ? 'Resetting…' : 'Yes, Reset Demo'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setResetConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-[10px] hover:bg-amber-600 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                </svg>
                Reset Demo Project
              </button>
            )}
          </div>
        )}

      </div>

      {/* Remove subcontractor confirmation dialog */}
      {confirmRemoveSubId && (() => {
        const sub = subcontractors.find(s => s.id === confirmRemoveSubId)
        const assignedCount = project.items.filter(i => !i.isHeader && i.subcontractorId === confirmRemoveSubId).length
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmRemoveSubId(null)} />
            <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
              <h3 className="text-base font-semibold text-slate-900 mb-2">Remove {sub?.name}?</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                This will unassign <span className="font-medium text-slate-700">{sub?.name}</span> from this project and revoke their access.
              </p>
              {assignedCount > 0 && (
                <div className="mt-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700 font-medium">
                    ⚠ {assignedCount} scope item{assignedCount !== 1 ? 's are' : ' is'} currently assigned to this subcontractor. Those assignments will remain on the line items but the sub will lose project access.
                  </p>
                </div>
              )}
              <div className="flex gap-2 mt-5">
                <button onClick={() => setConfirmRemoveSubId(null)} className="btn-ghost flex-1 border border-slate-200">Cancel</button>
                <button onClick={() => handleRemoveSubcontractor(confirmRemoveSubId)} className="flex-1 px-4 py-2 rounded-[10px] bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">Remove</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  )
}
