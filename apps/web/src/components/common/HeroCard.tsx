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
