/** School building with a clock, flag, trees and clouds (dashboard welcome banner). */
export function SchoolIllustration() {
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true">
      {/* clouds */}
      <g fill="#ffffff" opacity="0.18">
        <ellipse cx="28" cy="20" rx="14" ry="6" />
        <ellipse cx="38" cy="16" rx="10" ry="7" />
        <ellipse cx="132" cy="14" rx="12" ry="5" />
        <ellipse cx="140" cy="11" rx="8" ry="6" />
      </g>
      {/* ground */}
      <ellipse cx="82" cy="104" rx="76" ry="6" fill="#ffffff" opacity="0.12" />
      {/* trees */}
      <rect x="15" y="80" width="3" height="22" rx="1" fill="#7c4a1e" />
      <circle cx="16.5" cy="76" r="10" fill="#22c55e" />
      <circle cx="12" cy="82" r="6" fill="#16a34a" />
      <rect x="143" y="82" width="3" height="20" rx="1" fill="#7c4a1e" />
      <circle cx="144.5" cy="78" r="9" fill="#22c55e" />
      <circle cx="149" cy="84" r="5.5" fill="#16a34a" />
      {/* wings */}
      <rect x="28" y="56" width="34" height="46" fill="#f8fafc" />
      <rect x="98" y="56" width="34" height="46" fill="#f8fafc" />
      <path d="M25 58l20-12 20 12z" fill="#f97316" />
      <path d="M95 58l20-12 20 12z" fill="#f97316" />
      {/* main block */}
      <rect x="58" y="44" width="44" height="58" fill="#ffffff" />
      <path d="M53 46L80 24l27 22z" fill="#ea580c" />
      {/* clock */}
      <circle cx="80" cy="39" r="6" fill="#ffffff" stroke="#1e3a8a" strokeWidth="1.2" />
      <path d="M80 35.5V39l2.5 1.5" stroke="#1e3a8a" strokeWidth="1.2" fill="none" />
      {/* flag */}
      <path d="M80 24V8" stroke="#cbd5e1" strokeWidth="1.2" />
      <path d="M80 8h12l-3 3 3 3H80z" fill="#f0a500" />
      {/* windows */}
      <g fill="#93c5fd">
        <rect x="33" y="64" width="9" height="9" rx="1" />
        <rect x="48" y="64" width="9" height="9" rx="1" />
        <rect x="33" y="80" width="9" height="9" rx="1" />
        <rect x="48" y="80" width="9" height="9" rx="1" />
        <rect x="103" y="64" width="9" height="9" rx="1" />
        <rect x="118" y="64" width="9" height="9" rx="1" />
        <rect x="103" y="80" width="9" height="9" rx="1" />
        <rect x="118" y="80" width="9" height="9" rx="1" />
        <rect x="64" y="52" width="9" height="9" rx="1" />
        <rect x="87" y="52" width="9" height="9" rx="1" />
      </g>
      {/* door and steps */}
      <path d="M72 102V76a8 8 0 0116 0v26z" fill="#1e40af" />
      <path d="M80 70v32" stroke="#3b82f6" strokeWidth="0.8" />
      <rect x="66" y="100" width="28" height="3" rx="1" fill="#e2e8f0" />
    </svg>
  );
}
