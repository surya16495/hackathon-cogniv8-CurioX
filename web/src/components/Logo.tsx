export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="curiox-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#curiox-bg)" />
      <path d="M318 168a120 120 0 1 0 0 176" fill="none" stroke="#fff" strokeWidth="52" strokeLinecap="round" />
      <path d="M352 196l18 42 42 18-42 18-18 42-18-42-42-18 42-18z" fill="#fbbf24" />
    </svg>
  );
}
