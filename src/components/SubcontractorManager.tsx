import { useState } from 'react'
import type { Subcontractor } from '../types'
import { useStore } from '../store/useStore'

const COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#f97316', '#8b5cf6', '#ec4899',
  '#14b8a6', '#84cc16',
]

interface Props {
  projectId: string
  subcontractors: Subcontractor[]
  onClose: () => void
}

export function SubcontractorManager({ projectId, subcontractors, onClose }: Props) {
  const { addSubcontractor, deleteSubcontractor } = useStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [error, setError] = useState('')

  function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Name is required.'); return }
    if (subcontractors.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('A subcontractor with that name already exists.')
      return
    }
    const id = Math.random().toString(36).slice(2, 10)
    addSubcontractor(projectId, { id, name: trimmed, color })
    setName('')
    setColor(COLORS[0])
    setError('')
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Subcontractors</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Sub list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {subcontractors.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No subcontractors yet. Add one below.</p>
          ) : (
            <ul className="space-y-2">
              {subcontractors.map(sub => (
                <li key={sub.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                  <span className="text-sm text-slate-800 flex-1 font-medium">{sub.name}</span>
                  <button
                    onClick={() => deleteSubcontractor(projectId, sub.id)}
                    className="text-slate-300 hover:text-red-400 transition-colors"
                    title="Delete subcontractor"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add form */}
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Add subcontractor</p>

          <input
            type="text"
            placeholder="Company or name…"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Color palette */}
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `3px solid ${c}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleAdd}
            className="w-full py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Add subcontractor
          </button>
        </div>
      </div>
    </div>
  )
}
