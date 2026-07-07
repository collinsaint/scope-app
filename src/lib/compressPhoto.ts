const MAX_DIM = 2048
const QUALITY = 0.88

// Compress a photo (data URL or object URL) to max 2048px on the longest side.
// Outputs WebP when the browser supports it, JPEG otherwise.
export function compressPhoto(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      const webp = canvas.toDataURL('image/webp', QUALITY)
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = reject
    img.src = src
  })
}
