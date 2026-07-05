import { useState } from 'react'

interface Props {
  onClose: () => void
  onCreate: (name: string) => void
}

export function NewWalkModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter a name for this walk.'); return }
    onCreate(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">New Walk</h3>
          <p className="text-xs text-slate-400 mt-0.5">Enter a name for this walk session.</p>
        </div>
        <div>
          <input
            type="text"
            placeholder="e.g. Initial Walk, Punch List, Final Inspection…"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose() }}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            autoFocus
          />
          {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Create walk
          </button>
        </div>
      </div>
    </div>
  )
}
