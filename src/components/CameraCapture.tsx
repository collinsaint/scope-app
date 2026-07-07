import { useState, useRef, useEffect } from 'react'

interface CameraConstraintSet extends MediaTrackConstraintSet {
  zoom?: number
  pointsOfInterest?: Array<{ x: number; y: number }>
  focusMode?: string
}

interface Props {
  onCapture: (dataUrls: string[]) => void
  onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pinchDistRef = useRef<number | null>(null)

  const [captured, setCaptured] = useState<string[]>([])
  const [error, setError] = useState('')
  const [shutterFlash, setShutterFlash] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [maxZoom, setMaxZoom] = useState(5)
  const [hasHwZoom, setHasHwZoom] = useState(false)
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null)
  const [autoRotate, setAutoRotate] = useState(false)

  useEffect(() => {
    let mounted = true
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream

        const track = stream.getVideoTracks()[0]
        const caps = track.getCapabilities?.() as Record<string, unknown> | undefined
        if (caps) {
          const zc = caps.zoom
          if (zc && typeof zc === 'object' && 'max' in zc) {
            setHasHwZoom(true)
            setMaxZoom(Math.min((zc as { max: number }).max, 10))
          }
        }
      } catch {
        if (mounted) setError('Camera access denied or unavailable.')
      }
    }
    startCamera()
    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Hardware zoom via track constraints
  useEffect(() => {
    if (!hasHwZoom) return
    const track = streamRef.current?.getVideoTracks()[0]
    if (track) {
      try {
        track.applyConstraints({ advanced: [{ zoom } as CameraConstraintSet] }).catch(() => {})
      } catch { /**/ }
    }
  }, [zoom, hasHwZoom])

  async function takePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    setShutterFlash(true)
    setTimeout(() => setShutterFlash(false), 130)

    const vw = video.videoWidth
    const vh = video.videoHeight

    if (autoRotate) {
      // Bake CCW rotation into the captured image
      canvas.width = vh
      canvas.height = vw
      const ctx = canvas.getContext('2d')!
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.drawImage(video, -vw / 2, -vh / 2)
    } else {
      canvas.width = vw
      canvas.height = vh
      canvas.getContext('2d')!.drawImage(video, 0, 0)
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    setCaptured(prev => [...prev, dataUrl])
  }

  // Rotate a thumbnail CCW manually
  async function rotatePhoto(index: number) {
    const src = captured[index]
    const img = new Image()
    img.src = src
    await new Promise<void>(r => { img.onload = () => r() })
    const c = document.createElement('canvas')
    c.width = img.height
    c.height = img.width
    const ctx = c.getContext('2d')!
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
    const rotated = c.toDataURL('image/jpeg', 0.88)
    setCaptured(prev => prev.map((p, i) => i === index ? rotated : p))
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinchDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 2 || pinchDistRef.current === null) return
    const newDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    )
    const ratio = newDist / pinchDistRef.current
    pinchDistRef.current = newDist
    setZoom(prev => Math.max(1, Math.min(prev * ratio, maxZoom)))
  }

  function handleTouchEnd() {
    pinchDistRef.current = null
  }

  function handleTapFocus(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1 || pinchDistRef.current !== null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const tx = e.touches[0].clientX - rect.left
    const ty = e.touches[0].clientY - rect.top
    setFocusPoint({ x: tx, y: ty })
    setTimeout(() => setFocusPoint(null), 900)
    const track = streamRef.current?.getVideoTracks()[0]
    if (track) {
      try {
        track.applyConstraints({
          advanced: [{
            pointsOfInterest: [{ x: tx / rect.width, y: ty / rect.height }],
            focusMode: 'manual',
          } as CameraConstraintSet],
        }).catch(() => {})
      } catch { /**/ }
    }
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
          {/* Viewfinder */}
          <div
            className="flex-1 relative overflow-hidden"
            onTouchStart={(e) => { handleTouchStart(e); if (e.touches.length === 1) handleTapFocus(e) }}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                transformOrigin: 'center',
                transform: !hasHwZoom && zoom > 1 ? `scale(${zoom})` : 'none',
              }}
            />

            {/* Shutter flash overlay */}
            {shutterFlash && <div className="absolute inset-0 bg-white/70 pointer-events-none" />}

            {/* Tap-to-focus ring */}
            {focusPoint && (
              <div
                className="absolute w-14 h-14 border-2 border-yellow-400 rounded pointer-events-none"
                style={{ left: focusPoint.x - 28, top: focusPoint.y - 28, opacity: 0.9 }}
              />
            )}

            {/* Zoom badge */}
            {zoom !== 1 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[13px] font-semibold px-3 py-1 rounded-full pointer-events-none">
                {zoom.toFixed(1)}×
              </div>
            )}

            {/* Auto-rotate active badge */}
            {autoRotate && (
              <div className="absolute top-4 right-4 bg-amber-500/90 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full pointer-events-none flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                </svg>
                Auto-rotating
              </div>
            )}

            {/* Thumbnail strip */}
            {captured.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 p-3 flex gap-2 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent">
                {captured.map((src, i) => (
                  <div key={i} className="relative flex-shrink-0">
                    <img src={src} alt="" className="w-16 h-16 object-cover rounded-lg border-2 border-white/80 shadow" />
                    {/* Delete */}
                    <button
                      onClick={() => setCaptured(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[11px] font-bold flex items-center justify-center shadow"
                    >×</button>
                    {/* Rotate CCW */}
                    <button
                      onClick={() => rotatePhoto(i)}
                      className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-slate-700 text-white rounded-full flex items-center justify-center shadow"
                      title="Rotate counter-clockwise"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="bg-black flex-shrink-0" style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}>
            {/* Auto-rotate toggle + zoom row */}
            <div className="flex items-center gap-3 px-5 pt-3 pb-1">
              <button
                onClick={() => setAutoRotate(v => !v)}
                className={`flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1.5 rounded-lg border transition-colors ${
                  autoRotate ? 'border-amber-400 bg-amber-400/10 text-amber-400' : 'border-white/20 text-white/50'
                }`}
                title="Auto-rotate captured photos 90° CCW"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                </svg>
                <span className="text-[11px] font-semibold">Rotate</span>
              </button>

              <span className="text-[10px] text-white/40 flex-shrink-0">1×</span>
              <input
                type="range"
                min={1}
                max={maxZoom}
                step={0.1}
                value={zoom}
                onChange={e => setZoom(parseFloat(e.target.value))}
                className="flex-1"
                style={{ accentColor: 'white' }}
              />
              <span className="text-[10px] text-white/40 flex-shrink-0 w-7 text-right">{maxZoom}×</span>
            </div>

            {/* Shutter row */}
            <div className="flex items-center justify-between px-10 py-5">
              <button onClick={onClose} className="text-white/70 text-sm font-medium w-16">Cancel</button>

              <button
                onClick={takePhoto}
                className="flex items-center justify-center"
                style={{ width: 72, height: 72 }}
              >
                <div className="w-16 h-16 rounded-full bg-white border-4 border-white/40 shadow-lg active:scale-95 transition-transform" />
              </button>

              <button
                onClick={done}
                disabled={captured.length === 0}
                className="text-white text-sm font-semibold w-16 text-right disabled:opacity-30 transition-opacity"
              >
                Done{captured.length > 0 ? ` (${captured.length})` : ''}
              </button>
            </div>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </>
      )}
    </div>
  )
}
