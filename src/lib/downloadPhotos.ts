import JSZip from 'jszip'
import type { Walk } from '../types'

export async function buildPhotosZipBlob(walk: Walk): Promise<Blob | null> {
  const photos = walk.roomPhotos ?? []
  if (photos.length === 0) return null

  const zip = new JSZip()
  const root = zip.folder('walk-photos')!

  const byRoom: Record<string, typeof photos> = {}
  for (const photo of photos) {
    ;(byRoom[photo.room] = byRoom[photo.room] ?? []).push(photo)
  }

  for (const [room, roomPhotos] of Object.entries(byRoom)) {
    const folderName = room.replace(/[^a-z0-9]/gi, '_') || 'room'
    const roomFolder = root.folder(folderName)!
    roomPhotos.forEach((photo, i) => {
      const base64 = photo.data.split(',')[1]
      const ext = photo.data.startsWith('data:image/png') ? 'png' : 'jpg'
      const ts = new Date(photo.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
      roomFolder.file(`photo_${String(i + 1).padStart(2, '0')}_${ts}.${ext}`, base64, { base64: true })
    })
  }

  return zip.generateAsync({ type: 'blob' })
}

export async function downloadWalkPhotos(walk: Walk, projectName: string): Promise<void> {
  const blob = await buildPhotosZipBlob(walk)
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `walk-photos-${walk.name.replace(/\s+/g, '-')}-${projectName.replace(/\s+/g, '-')}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
