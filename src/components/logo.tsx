export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="100" y2="100">
          <stop offset="0" stopColor="#3AE07A" />
          <stop offset="1" stopColor="#009142" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="26" fill="url(#logoGrad)" />
      <path d="M38 78V46" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
      <path d="M24 46 70 22" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M53 23.5 71 20.5 74 39"
        stroke="#fff"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Wordmark({ size = 19, showTagline = false }: { size?: number; showTagline?: boolean }) {
  return (
    <div>
      <div className="wordmark" style={{ fontSize: size }}>
        <span className="wm-top">Top</span>
        <span className="wm-me">Me</span>
      </div>
      {showTagline && (
        <div className="tagline">
          <i />
          Top up. Pay easy.
          <i />
        </div>
      )}
    </div>
  );
}

export function Logo({ size = 34, showTagline = false }: { size?: number; showTagline?: boolean }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <BrandMark size={size} />
      <Wordmark size={size <= 28 ? 16 : 19} showTagline={showTagline} />
    </div>
  );
}
