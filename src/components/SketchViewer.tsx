import { useState, useEffect, useRef } from 'react'
import type { ProjectSketch } from '../types'
import { useViewMode } from '../hooks/useViewMode'

interface Props {
  sketches: ProjectSketch[]
  onClose: () => void
}

function dataUrlToBlobUrl(dataUrl: string): string {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'application/pdf'
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return URL.createObjectURL(new Blob([arr], { type: mime }))
}

export function SketchViewer({ sketches, onClose }: Props) {
  const { isMobile } = useViewMode()
  const [index, setIndex] = useState(0)
  const blobUrlsRef = useRef<Record<number, string>>({})
  const current = sketches[index]

  // Build blob URLs lazily and clean up on unmount
  function getBlobUrl(idx: number): string {
    if (!blobUrlsRef.current[idx]) {
      blobUrlsRef.current[idx] = dataUrlToBlobUrl(sketches[idx].data)
    }
    return blobUrlsRef.current[idx]
  }

  useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach(URL.revokeObjectURL)
    }
  }, [])

  function prev() { setIndex((i) => (i - 1 + sketches.length) % sketches.length) }
  function next() { setIndex((i) => (i + 1) % sketches.length) }

  const blobUrl = getBlobUrl(index)
  const isImage = current.data.startsWith('data:image/')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        className="relative bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(96vw, 1000px)', height: 'min(92vh, 800px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="text-sm font-semibold text-slate-800">{current.label}</span>
            <span className="text-xs text-slate-400 truncate hidden sm:block">{current.fileName}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {sketches.length > 1 && (
              <span className="text-xs text-slate-400">{index + 1} / {sketches.length}</span>
            )}
            {/* Open in new tab — especially useful on mobile */}
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
              title="Open in new tab"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              {isMobile ? 'Open' : isImage ? 'Open Image' : 'Open PDF'}
            </a>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 relative overflow-hidden bg-slate-100">
          {isImage ? (
            <img
              key={current.data}
              src={current.data}
              alt={current.label}
              className="w-full h-full object-contain bg-slate-100"
            />
          ) : (
            <iframe
              key={blobUrl}
              src={blobUrl}
              className="w-full h-full border-0 bg-white"
              title={current.label}
            />
          )}

          {/* Mobile tap-to-open hint overlay */}
          {isMobile && (
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-slate-900/80 text-white text-xs rounded-full shadow-lg backdrop-blur-sm whitespace-nowrap"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              {isImage ? 'Tap to open full image' : 'Tap to open full PDF'}
            </a>
          )}

          {/* Prev / Next arrows */}
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
