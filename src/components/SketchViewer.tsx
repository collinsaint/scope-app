import { useState } from 'react'
import type { ProjectSketch } from '../types'

interface Props {
  sketches: ProjectSketch[]
  onClose: () => void
}

export function SketchViewer({ sketches, onClose }: Props) {
  const [index, setIndex] = useState(0)
  const current = sketches[index]

  function prev() { setIndex((i) => (i - 1 + sketches.length) % sketches.length) }
  function next() { setIndex((i) => (i + 1) % sketches.length) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(90vw, 1000px)', height: 'min(90vh, 800px)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="text-sm font-semibold text-slate-800">{current.label}</span>
            <span className="text-xs text-slate-400">{current.fileName}</span>
          </div>
          <div className="flex items-center gap-3">
            {sketches.length > 1 && (
              <span className="text-xs text-slate-400">{index + 1} / {sketches.length}</span>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* PDF viewer */}
        <div className="flex-1 relative overflow-hidden">
          <iframe
            key={current.data}
            src={current.data}
            className="w-full h-full border-0"
            title={current.label}
          />

          {/* Prev arrow */}
          {sketches.length > 1 && (
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 hover:bg-white border border-slate-200 rounded-full shadow flex items-center justify-center transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}

          {/* Next arrow */}
          {sketches.length > 1 && (
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 hover:bg-white border border-slate-200 rounded-full shadow flex items-center justify-center transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )}
        </div>

        {/* Tab strip — only when multiple sketches */}
        {sketches.length > 1 && (
          <div className="flex border-t border-slate-100 flex-shrink-0">
            {sketches.map((sk, i) => (
              <button
                key={sk.label}
                onClick={() => setIndex(i)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  i === index
                    ? 'text-blue-600 border-t-2 border-blue-600 -mt-px bg-blue-50/50'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {sk.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
