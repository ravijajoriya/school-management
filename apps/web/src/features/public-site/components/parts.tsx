import { CheckCircle2, ChevronRight, ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageSpinner } from '@/components/ui';
import { mediaUrl } from '@/lib/public-api';

/** Navy banner with page title and breadcrumb, used at the top of inner pages. */
export function PageBanner({
  title,
  crumbs = [],
}: {
  title: string;
  crumbs?: { to?: string; label: string }[];
}) {
  return (
    <section className="relative overflow-hidden bg-brand-navy text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(240,165,0,0.18),transparent_45%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        <nav
          aria-label="Breadcrumb"
          className="mt-3 flex flex-wrap items-center gap-1 text-sm text-white/80"
        >
          <Link to="/" className="hover:text-brand-gold">
            Home
          </Link>
          {[...crumbs, { label: title }].map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              {c.to ? (
                <Link to={c.to} className="hover:text-brand-gold">
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </section>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-brand-navy md:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** A CMS image, or a tasteful placeholder when none has been uploaded yet. */
export function CmsImage({
  imageId,
  alt,
  className = '',
}: {
  imageId: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (imageId) {
    return (
      <img
        src={mediaUrl(imageId)}
        alt={alt}
        loading="lazy"
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex items-center justify-center bg-gradient-to-br from-brand-navy/10 via-brand-gold-light to-brand-navy/5 text-brand-navy/30 ${className}`}
    >
      <ImageIcon className="h-10 w-10" aria-hidden="true" />
    </div>
  );
}

/** Plain CMS text with line breaks preserved (never rendered as HTML). */
export function PlainText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-line leading-relaxed text-ink-muted ${className}`}>{text}</p>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-ink">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Left sub-navigation on About/Academics, linking to sections on the same page. */
export function SideNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-28">
      <ul className="overflow-hidden rounded-lg border border-gray-200 bg-white text-sm shadow-sm">
        {items.map((item, i) => (
          <li key={item.id} className={i ? 'border-t border-gray-100' : ''}>
            <a
              href={`#${item.id}`}
              className={`block px-4 py-3 transition-colors hover:bg-brand-gold-light hover:text-brand-navy ${
                i === 0
                  ? 'bg-brand-navy font-medium text-white hover:bg-brand-navy-light hover:text-white'
                  : 'text-ink'
              }`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Loading / error wrapper for public page content. */
export function PageState({
  isLoading,
  isError,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  children: ReactNode;
}) {
  if (isLoading) return <PageSpinner />;
  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center text-ink-muted">
        This page could not be loaded right now. Please try again in a moment.
      </div>
    );
  }
  return children;
}

export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

/** Calendar-style date badge used in announcement and event lists. */
export function DateChip({ day, month }: { day: string; month: string }) {
  return (
    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-brand-gold-light text-brand-navy">
      <span className="text-lg font-bold leading-none">{day}</span>
      <span className="text-[11px] font-medium uppercase">{month}</span>
    </span>
  );
}
