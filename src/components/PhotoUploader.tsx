import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useStore } from '../store/useStore'
import { compressPhoto } from '../lib/compressPhoto'

interface Props {
  projectId: string
  itemId: string
  photos: string[]
}

export function PhotoUploader({ projectId, itemId, photos }: Props) {
  const { addPhoto, removePhoto } = useStore()
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)

  const onDrop = useCallback(async (accepted: File[]) => {
    setUploading(true)
    for (const file of accepted) {
      const url = URL.createObjectURL(file)
      try {
        const dataUrl = await compressPhoto(url)
        addPhoto(projectId, itemId, dataUrl)
      } catch { /* skip failed */ } finally {
        URL.revokeObjectURL(url)
      }
    }
    setUploading(false)
  }, [projectId, itemId, addPhoto])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  })

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setLightboxIndex(null); return }
      if (e.key === 'ArrowRight') setLightboxIndex(i => i !== null ? (i + 1) % photos.length : null)
      if (e.key === 'ArrowLeft') setLightboxIndex(i => i !== null ? (i - 1 + photos.length) % photos.length : null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, photos.length])

  return (
    <>
      <div className="space-y-2">
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {photos.map((src, i) => (
              <div key={i} className="relative group">
                <img
                  src={src}
                  alt=""
                  className="h-16 w-16 object-cover rounded-md border border-slate-200 cursor-zoom-in hover:brightness-90 transition-[filter]"
                  onClick={() => confirmDeleteIndex === null && setLightboxIndex(i)}
                />
                {confirmDeleteIndex === i ? (
                  <div className="absolute inset-0 rounded-md bg-black/70 flex flex-col items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <span className="text-white text-[9px] font-semibold leading-tight">Delete?</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { removePhoto(projectId, itemId, i); setConfirmDeleteIndex(null) }}
                        className="w-5 h-5 rounded bg-red-500 hover:bg-red-600 text-white text-[10px] flex items-center justify-center transition-colors"
                      >✓</button>
                      <button
                        onClick={() => setConfirmDeleteIndex(null)}
                        className="w-5 h-5 rounded bg-white/20 hover:bg-white/30 text-white text-[10px] flex items-center justify-center transition-colors"
                      >×</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteIndex(i) }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >×</button>
                )}
              </div>
            ))}
          </div>
        )}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-colors text-[12px] ${
            isDragActive ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          }`}
        >
          <input {...getInputProps()} />
          <span className="text-slate-400">{uploading ? 'Uploading…' : 'Drop photos here or click to browse'}</span>
        </div>
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors text-xl"
          >
            ×
          </button>

          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length) }}
                className="absolute left-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors text-lg"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % photos.length) }}
                className="absolute right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors text-lg"
              >
                ›
              </button>
            </>
          )}

          <img
            src={photos[lightboxIndex]}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {photos.length > 1 && (
            <div className="absolute bottom-4 text-white/50 text-xs">
              {lightboxIndex + 1} / {photos.length}
            </div>
          )}
        </div>
      )}
    </>
  )
}
