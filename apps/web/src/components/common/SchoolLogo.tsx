/** Placeholder emblem (open book in a gold ring) until the school provides its official logo. */
export function SchoolLogo({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke="var(--color-brand-gold)" strokeWidth="3" />
      <path
        d="M13 16c4-1.5 7.5-1 11 1.5V34c-3.5-2.5-7-3-11-1.5V16Zm22 0c-4-1.5-7.5-1-11 1.5V34c3.5-2.5 7-3 11-1.5V16Z"
        fill="var(--color-brand-navy)"
      />
    </svg>
  );
}
