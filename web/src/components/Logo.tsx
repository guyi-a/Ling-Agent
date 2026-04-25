export default function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient id="ling-lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path
        d="M13 4a3 3 0 00-3 3v15a3 3 0 003 3h12a3 3 0 100-6H16V7a3 3 0 00-3-3z"
        fill="url(#ling-lg)"
      />
      <circle cx="24" cy="8" r="2.5" fill="url(#ling-lg)" />
    </svg>
  )
}
