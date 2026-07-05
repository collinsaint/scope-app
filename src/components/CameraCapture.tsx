import { useState, useRef, useEffect } from 'react'

interface Props {
  onCapture: (dataUrls: string[]) => void
  onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captured, setCaptured] = useState<string[]>([])
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        setError('Camera access denied or unavailable.')
      }
    }
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  function takePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    setCaptured(prev => [...prev, dataUrl])
    // brief flash
    setFlash(true)
    setTimeout(() => setFlash(false), 120)
  }

  function done() {
    onCapture(captured)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-white gap-4 px-8 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
          <p className="text-sm opacity-70">{error}</p>
          <button onClick={onClose} className="px-5 py-2.5 bg-white/20 rounded-xl text-sm font-medium">Close</button>
        </div>
      ) : (
        <>
          {/* Live viewfinder */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Flash overlay */}
            {flash && <div className="absolute inset-0 bg-white/70 pointer-events-none" />}

            {/* Thumbnail strip at bottom of viewfinder */}
            {captured.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 p-3 flex gap-2 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent">
                {captured.map((src, i) => (
                  <div key={i} className="relative flex-shrink-0">
                    <img src={src} alt="" className="w-16 h-16 object-cover rounded-lg border-2 border-white/80 shadow" />
                    <button
                      onClick={() => setCaptured(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[11px] font-bold flex items-center justify-center shadow"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Controls bar */}
          <div className="flex items-center justify-between px-10 py-6 bg-black flex-shrink-0"
               style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
            {/* Cancel */}
            <button onClick={onClose} className="text-white/70 text-sm font-medium w-16">
              Cancel
            </button>

            {/* Shutter button */}
            <button
              onClick={takePhoto}
              className="w-18 h-18 flex items-center justify-center"
              style={{ width: 72, height: 72 }}
            >
              <div className="w-16 h-16 rounded-full bg-white border-4 border-white/40 shadow-lg active:scale-95 transition-transform" />
            </button>

            {/* Done */}
            <button
              onClick={done}
              disabled={captured.length === 0}
              className="text-white text-sm font-semibold w-16 text-right disabled:opacity-30 transition-opacity"
            >
              Done{captured.length > 0 ? ` (${captured.length})` : ''}
            </button>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </>
      )}
    </div>
  )
}
