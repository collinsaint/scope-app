interface Props {
  message?: string
}

export function VerascopeLoader({ message = 'Syncing…' }: Props) {
  // Ring circumference: 2π × 9.5 ≈ 59.69
  return (
    <>
      <style>{`
        @keyframes vs-draw-ring {
          from { stroke-dashoffset: 59.69; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes vs-dot-pop {
          0%   { transform: scale(0); opacity: 0; }
          70%  { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes vs-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vs-bar-slide {
          0%   { left: -55%; width: 55%; }
          60%  { left: 65%; width: 55%; }
          100% { left: 120%; width: 55%; }
        }
        @keyframes vs-breathe {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%       { transform: scale(1.07); opacity: 0.78; }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
        style={{ background: '#3C3489' }}
      >
        {/* Animated bullseye */}
        <div style={{ animation: 'vs-breathe 2.4s ease-in-out 1.6s infinite' }}>
          <svg width="80" height="80" viewBox="0 0 36 36" role="img" aria-label="Verascope">
            <circle
              cx="18" cy="18" r="9.5"
              fill="none"
              stroke="#AFA9EC"
              strokeWidth="4"
              strokeDasharray="59.69"
              style={{
                animation: 'vs-draw-ring 0.6s cubic-bezier(0.4,0,0.2,1) 0s both',
              }}
            />
            <circle
              cx="18" cy="18" r="2.2"
              fill="#EEEDFE"
              style={{
                transformOrigin: '18px 18px',
                animation: 'vs-dot-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.55s both',
              }}
            />
          </svg>
        </div>

        {/* Wordmark */}
        <p
          className="font-medium text-2xl mt-5 tracking-tight"
          style={{
            color: '#ffffff',
            animation: 'vs-fade-up 0.4s ease-out 1.0s both',
          }}
        >
          Verascope
        </p>

        {/* Tagline */}
        <p
          className="text-sm mt-1"
          style={{
            color: '#AFA9EC',
            animation: 'vs-fade-up 0.4s ease-out 1.2s both',
          }}
        >
          Every item, verified
        </p>

        {/* Status message */}
        <p
          className="text-sm mt-8"
          style={{
            color: 'rgba(206,203,246,0.65)',
            animation: 'vs-fade-up 0.3s ease-out 1.35s both',
          }}
        >
          {message}
        </p>

        {/* Indeterminate progress bar */}
        <div
          className="mt-3 relative overflow-hidden rounded-full"
          style={{
            width: 160,
            height: 3,
            background: 'rgba(206,203,246,0.18)',
            animation: 'vs-fade-up 0.3s ease-out 1.35s both',
          }}
        >
          <div
            className="absolute top-0 h-full rounded-full"
            style={{
              background: '#AFA9EC',
              animation: 'vs-bar-slide 1.4s cubic-bezier(0.4,0,0.2,1) 1.6s infinite',
            }}
          />
        </div>
      </div>
    </>
  )
}
