import type { ReactNode } from 'react';

/**
 * Page header card: light-blue panel with the page title (gold underline), a short description
 * and an illustration on the right. Used by redesigned pages (Students, Class Register).
 */
export function HeroCard({
  title,
  description,
  illustration,
}: {
  title: string;
  description: ReactNode;
  /** Drawn at the right; sized by the card. */
  illustration: ReactNode;
}) {
  return (
    <div className="relative mb-3 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100/70 px-4 py-3.5 ring-1 ring-blue-100 sm:mb-4 sm:p-6 print:hidden">
      <span
        className="pointer-events-none absolute -bottom-10 right-4 h-36 w-36 rounded-full bg-blue-200/30 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.1rem] font-bold leading-tight tracking-tight text-brand-navy min-[400px]:text-[1.2rem] sm:text-3xl">
            {title}
          </h1>
          <span
            className="mt-1.5 block h-1 w-10 rounded-full bg-gradient-to-r from-brand-gold to-amber-400 sm:mt-2 sm:w-12"
            aria-hidden="true"
          />
          <p className="mt-1.5 text-[13px] leading-snug text-ink-muted sm:mt-3 sm:text-base sm:leading-relaxed">
            {description}
          </p>
        </div>
        <div className="h-14 w-14 shrink-0 min-[400px]:h-16 min-[400px]:w-16 sm:h-28 sm:w-28 [&>svg]:h-full [&>svg]:w-full">
          {illustration}
        </div>
      </div>
    </div>
  );
}

/** Student in a graduation cap (Students page). */
export function GraduateIllustration() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="grad-gown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="grad-cap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <clipPath id="grad-circle">
          <circle cx="60" cy="64" r="48" />
        </clipPath>
      </defs>
      <circle cx="60" cy="64" r="48" fill="#ffffff" opacity="0.85" />
      <g clipPath="url(#grad-circle)">
        {/* gown and collar */}
        <path d="M22 118c2-22 18-34 38-34s36 12 38 34z" fill="url(#grad-gown)" />
        <path d="M48 86l12 14 12-14-12-4z" fill="#ffffff" />
        <path d="M56 86h8v10l-4 4-4-4z" fill="#f1c7a3" />
        {/* neck and face */}
        <rect x="54" y="74" width="12" height="12" rx="4" fill="#f1c7a3" />
        <ellipse cx="60" cy="60" rx="17" ry="19" fill="#f6d2b4" />
        <path d="M43 58c0-12 7-19 17-19s17 7 17 19c-3-6-9-9-17-9s-14 3-17 9z" fill="#1f2937" />
        <circle cx="54" cy="62" r="1.8" fill="#1f2937" />
        <circle cx="66" cy="62" r="1.8" fill="#1f2937" />
        <path
          d="M55.5 69c2.6 2 6.4 2 9 0"
          stroke="#c0846a"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      </g>
      {/* mortarboard */}
      <path d="M60 22L22 36l38 14 38-14z" fill="url(#grad-cap)" />
      <path d="M40 43v8c0 4 9 8 20 8s20-4 20-8v-8l-20 7z" fill="#1e40af" />
      <path d="M92 38v20" stroke="#f0a500" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="89" y="56" width="6" height="10" rx="2" fill="#f0a500" />
    </svg>
  );
}

/** Two staff members, a teacher and an office colleague (Staff page). */
export function StaffIllustration() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id="staff-clip">
          <rect x="0" y="0" width="120" height="112" rx="10" />
        </clipPath>
      </defs>
      <ellipse cx="62" cy="70" rx="54" ry="44" fill="#dbeafe" opacity="0.8" />
      <g clipPath="url(#staff-clip)">
        {/* man (back, right) */}
        <path d="M58 112c1-20 12-31 28-31s27 11 28 31z" fill="#ffffff" stroke="#cbd5e1" />
        <path d="M84 82l2 6 2-6z" fill="#e2e8f0" />
        <path d="M86 88l-3 4 3 20 3-20z" fill="#1e3a8a" />
        <rect x="80" y="70" width="12" height="13" rx="4" fill="#efc19f" />
        <ellipse cx="86" cy="58" rx="14" ry="16" fill="#f6d2b4" />
        <path d="M72 55c0-11 6-17 14-17s14 6 14 17c-2-5-7-8-14-8s-12 3-14 8z" fill="#1f2937" />
        <circle cx="81" cy="59" r="4" fill="none" stroke="#1f2937" strokeWidth="1.6" />
        <circle cx="91" cy="59" r="4" fill="none" stroke="#1f2937" strokeWidth="1.6" />
        <path d="M85 59h2" stroke="#1f2937" strokeWidth="1.6" />
        <path
          d="M82.5 66c2 1.4 5 1.4 7 0"
          stroke="#c0846a"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        {/* woman (front, left) */}
        <path d="M8 112c1-19 12-29 27-29s26 10 27 29z" fill="#2563eb" />
        <path d="M28 84l7 12 7-12-7-3z" fill="#ffffff" />
        <path d="M31 88l4 9 4-9" fill="none" stroke="#1e3a8a" strokeWidth="1.4" />
        <rect
          x="32.5"
          y="97"
          width="5"
          height="6"
          rx="1"
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth="0.8"
        />
        <rect x="29" y="72" width="12" height="12" rx="4" fill="#efc19f" />
        <path
          d="M17 66c-2-17 6-27 18-27s20 10 18 27c-1 6-3 10-5 12V60H22v18c-2-2-4-6-5-12z"
          fill="#1f2937"
        />
        <ellipse cx="35" cy="61" rx="13" ry="15" fill="#f6d2b4" />
        <path d="M22 58c2-9 8-13 13-13s11 4 13 13c-4-4-8-6-13-6s-9 2-13 6z" fill="#1f2937" />
        <circle cx="30.5" cy="62" r="1.6" fill="#1f2937" />
        <circle cx="39.5" cy="62" r="1.6" fill="#1f2937" />
        <path
          d="M31.5 68c2 1.4 4.6 1.4 7 0"
          stroke="#c0846a"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
