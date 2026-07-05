import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useStore } from '../store/useStore'
import { parseExcelFile } from '../lib/parseExcel'

interface Props {
  onClose: () => void
  onCreated: (id: string) => void
}

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

export function NewProjectModal({ onClose, onCreated }: Props) {
  const { addProject } = useStore()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [projectType, setProjectType] = useState<'site-visit' | 'ready-for-work'>('site-visit')

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0])
      setError('')
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    maxFiles: 1,
  })

  async function handleCreate() {
    if (!name.trim()) { setError('Project name is required.'); return }
    if (projectType === 'ready-for-work' && !file) { setError('Upload a scope of work Excel file.'); return }
    setLoading(true)
    try {
      const id = randomId()
      const siteVisitWalk = projectType === 'site-visit'
        ? [{ id: randomId(), name: 'Site Visit', createdAt: new Date().toISOString() }]
        : undefined
      if (projectType === 'site-visit' && !file) {
        addProject({
          id,
          name: name.trim(),
          address: address.trim(),
          createdAt: new Date().toISOString(),
          fileName: '',
          items: [],
          projectStatus: 'Site Visit',
          walks: siteVisitWalk,
        })
      } else {
        const buffer = await file!.arrayBuffer()
        const items = parseExcelFile(buffer)
        addProject({
          id,
          name: name.trim(),
          address: address.trim(),
          createdAt: new Date().toISOString(),
          fileName: file!.name,
          items,
          ...(projectType === 'site-visit' ? { projectStatus: 'Site Visit', walks: siteVisitWalk } : {}),
        })
      }
      onCreated(id)
      onClose()
    } catch {
      setError('Could not parse the Excel file. Make sure it is an Xactimate export.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">New project</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Project name</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. 123 Oak St — Claim #4421"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Address (optional)</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. 123 Oak Street, Springfield, IL"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </div>
          {/* Project type selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Project type</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => { setProjectType('site-visit'); setError('') }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  projectType === 'site-visit'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                Site Visit
              </button>
              <button
                type="button"
                onClick={() => { setProjectType('ready-for-work'); setError('') }}
                className={`flex-1 py-2 text-sm font-medium border-l border-slate-200 transition-colors ${
                  projectType === 'ready-for-work'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                Ready for Work
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {projectType === 'site-visit'
                ? 'Project starts in Site Visit status. You can upload a Main Scope later.'
                : 'Upload a Main Scope now to get started.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Scope of work (Excel){projectType === 'site-visit' && <span className="text-slate-400 font-normal"> — optional</span>}
            </label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-blue-400 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-green-700">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
              ) : (
                <div>
                  <svg className="mx-auto mb-2 text-slate-300" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <p className="text-sm text-slate-500">Drag &amp; drop your Xactimate Excel file</p>
                  <p className="text-xs text-slate-400 mt-1">or click to browse &nbsp;·&nbsp; .xlsx / .xls</p>
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Parsing…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
