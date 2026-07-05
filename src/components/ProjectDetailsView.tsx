import { useState, useRef } from 'react'
import type { Project, SketchLabel } from '../types'
import { SKETCH_LABELS } from '../types'
import { useStore } from '../store/useStore'


function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  project: Project
}

export function ProjectDetailsView({ project }: Props) {
  const { updateProjectDetails, jobGroups, superintendents, addSketch, removeSketch } = useStore()
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

  const dataItems = project.items.filter(i => !i.isHeader)
  const completed = dataItems.filter(i => i.completed)
  const totalAmount = dataItems.reduce((s, i) => s + i.rcv, 0)
  const completedAmount = completed.reduce((s, i) => s + i.rcv, 0)
  const remainingAmount = totalAmount - completedAmount
  const pct = dataItems.length ? Math.round(completed.length / dataItems.length * 100) : 0
  const subcontractors = project.subcontractors ?? []
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

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      <div className="max-w-5xl space-y-6">

        {/* Project Info + Applicant Info side by side */}
        <div className="grid grid-cols-2 gap-4 items-start">

          {/* Project Info */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Project Info</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Project Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setSaved(false) }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => { setAddress(e.target.value); setSaved(false) }}
                  placeholder="No address"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Project ID</label>
                <input
                  type="text"
                  value={projectCode}
                  onChange={e => { setProjectCode(e.target.value); setSaved(false) }}
                  placeholder="—"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Job Group</label>
                <select
                  value={jobGroup}
                  onChange={e => { setJobGroup(e.target.value); setSaved(false) }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
                >
                  <option value="">— None —</option>
                  {jobGroups.map(g => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
                {jobGroups.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">No job groups yet — add them in Contractor Settings.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Superintendent</label>
                <select
                  value={superintendent}
                  onChange={e => { setSuperintendent(e.target.value); setSaved(false) }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
                >
                  <option value="">— None —</option>
                  {superintendents.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
                {superintendents.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">No superintendents yet — add them in Contractor Settings.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Project Status</label>
                <select
                  value={projectStatus}
                  onChange={e => { setProjectStatus(e.target.value); setSaved(false) }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
                >
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
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Applicant Info</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Applicant Name</label>
                <input
                  type="text"
                  value={applicantName}
                  onChange={e => { setApplicantName(e.target.value); setSaved(false) }}
                  placeholder="—"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Applicant Phone #</label>
                <input
                  type="tel"
                  value={applicantPhone}
                  onChange={e => { setApplicantPhone(e.target.value); setSaved(false) }}
                  placeholder="—"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Applicant Email</label>
                <input
                  type="email"
                  value={applicantEmail}
                  onChange={e => { setApplicantEmail(e.target.value); setSaved(false) }}
                  placeholder="—"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </div>
          </div>

        </div>

        {/* Save button — spans full width below both cards */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isDirty
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
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

        {/* Financial summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Financial Summary</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Total Amount</p>
              <p className="text-base font-semibold text-slate-900">{fmt(totalAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Completed Amount</p>
              <p className="text-base font-semibold text-green-600">{fmt(completedAmount)}</p>
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
            <div className="h-2 bg-slate-100 rounded-full">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Scope details */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Scope Details</h2>
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
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Project Sketches</h2>
          <p className="text-xs text-slate-400 mb-4">Upload up to 3 PDF sketches. Each must have a unique level name.</p>

          {/* Uploaded sketches */}
          {sketches.length > 0 && (
            <div className="space-y-2 mb-4">
              {SKETCH_LABELS.filter(l => usedLabels.has(l)).map(label => {
                const sk = sketches.find(s => s.label === label)!
                return (
                  <div key={label} className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="text-xs font-semibold text-slate-700 w-24 flex-shrink-0">{label}</span>
                    <span className="text-xs text-slate-400 flex-1 truncate">{sk.fileName}</span>
                    <button
                      onClick={() => removeSketch(project.id, label)}
                      className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Upload form */}
          {availableLabels.length > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={sketchLabel}
                onChange={e => setSketchLabel(e.target.value as SketchLabel)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 bg-white"
              >
                {availableLabels.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button
                onClick={() => sketchInputRef.current?.click()}
                disabled={sketchUploading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {sketchUploading ? 'Uploading…' : 'Upload PDF'}
              </button>
              <input
                ref={sketchInputRef}
                type="file"
                accept="application/pdf"
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

        {/* Rooms */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Rooms / Areas ({rooms.length})</h2>
          <div className="flex flex-wrap gap-2">
            {rooms.map(r => {
              const roomItems = dataItems.filter(i => i.room === r)
              const roomDone = roomItems.filter(i => i.completed).length
              const roomPct = roomItems.length ? Math.round(roomDone / roomItems.length * 100) : 0
              return (
                <div key={r} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-xs font-medium text-slate-700">{r}</span>
                  <span className="text-[10px] text-slate-400">{roomItems.length} items</span>
                  {roomPct > 0 && (
                    <span className={`text-[10px] font-semibold ${roomPct === 100 ? 'text-green-500' : 'text-blue-500'}`}>{roomPct}%</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
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
