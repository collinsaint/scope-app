import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useStore } from '../store/useStore'
import { uploadPhotoToOneDrive } from '../lib/oneDrive'

interface Props {
  projectId: string
  itemId: string
  photos: string[]
}

function resizeImage(file: File, maxWidth = 900, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('No canvas context'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = url
  })
}

export function PhotoUploader({ projectId, itemId, photos }: Props) {
  const { addPhoto, removePhoto, oneDrive } = useStore()
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback(async (accepted: File[]) => {
    setUploading(true)
    const project = useStore.getState().projects.find(p => p.id === projectId)
    for (const file of accepted) {
      try {
        const dataUrl = await resizeImage(file)
        addPhoto(projectId, itemId, dataUrl)

        // Fire-and-forget OneDrive sync — never blocks the UI
        if (oneDrive.connected && project) {
          const fileName = `${itemId}_${Date.now()}.jpg`
          uploadPhotoToOneDrive(oneDrive.rootFolderName, project.name, dataUrl, fileName).catch(() => {})
        }
      } catch { /* skip failed */ }
    }
    setUploading(false)
  }, [projectId, itemId, addPhoto, oneDrive])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  })

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {photos.map((src, i) => (
            <div key={i} className="relative group">
              <img src={src} alt="" className="h-16 w-16 object-cover rounded-md border border-slate-200" />
              <button
                onClick={() => removePhoto(projectId, itemId, i)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
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
  )
}
