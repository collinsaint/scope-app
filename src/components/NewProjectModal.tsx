import { useState } from 'react'
import { useStore } from '../store/useStore'

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
  const [error, setError] = useState('')

  function handleCreate() {
    if (!name.trim()) { setError('Project name is required.'); return }
    const id = randomId()
    addProject({
      id,
      name: name.trim(),
      address: address.trim(),
      createdAt: new Date().toISOString(),
      fileName: '',
      items: [],
      documents: [],
    })
    onCreated(id)
    onClose()
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
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Address <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. 123 Oak Street, Springfield, IL"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            You'll upload scope documents after the project is created.
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="flex-1 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create project
          </button>
        </div>
      </div>
    </div>
  )
}
