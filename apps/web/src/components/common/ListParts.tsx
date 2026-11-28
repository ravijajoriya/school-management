import {
  ChevronDown,
  EllipsisVertical,
  Filter,
  LayoutGrid,
  List as ListIcon,
  Search,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui';
import { initials, toneFor } from '@/lib/list-tone';
import type { ViewMode } from '@/lib/use-view-mode';

/* Building blocks shared by the redesigned list pages (Students, Staff). */

/** Initials in a soft coloured circle (same colour for the same name). */
export function InitialsAvatar({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${toneFor(name)} ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** A small coloured pill; the colour follows `toneKey` (defaults to the text). */
export function TonePill({ children, toneKey }: { children: string; toneKey?: string }) {
  return (
    <span
      className={`inline-block max-w-full truncate rounded-full px-1.5 py-px text-[10.5px] font-medium sm:px-2 sm:py-0.5 sm:text-xs ${toneFor(toneKey ?? children)}`}
    >
      {children}
    </span>
  );
}

const controlClass =
  'block w-full min-w-0 rounded-lg border border-gray-300 bg-white py-2 text-base text-ink transition-shadow placeholder:text-gray-400 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40 disabled:bg-gray-100 disabled:text-ink-muted sm:text-sm';

/** A select with an optional icon (or dot) inside on the left and a chevron on the right. */
export function IconSelect({
  icon: Icon,
  leading,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: LucideIcon; leading?: ReactNode }) {
  const lead = leading ?? (Icon && <Icon className="h-4 w-4" aria-hidden="true" />);
  return (
    <div className={`relative min-w-0 ${className}`}>
      {lead && (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-ink">
          {lead}
        </span>
      )}
      <select
        {...props}
        className={`${controlClass} appearance-none truncate pr-6 ${lead ? 'pl-8' : 'pl-3'}`}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        aria-hidden="true"
      />
    </div>
  );
}

/** Search box with a magnifier icon. */
export function SearchBox({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink"
        aria-hidden="true"
      />
      <input type="search" {...props} className={`${controlClass} pl-9 pr-3`} />
    </div>
  );
}

/** Collapsible "Search & Filters" card; children are laid out in a 2-column grid (4 on wide). */
export function FilterCard({ id, children }: { id: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="mb-3 sm:mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <Filter className="h-[18px] w-[18px] shrink-0 text-ink" aria-hidden="true" />
        <span className="flex-1 text-[15px] font-semibold text-brand-navy sm:text-base">
          Search &amp; Filters
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div
        id={id}
        hidden={!open}
        className="grid grid-cols-2 gap-2.5 px-4 pb-4 sm:px-5 lg:grid-cols-4"
      >
        {children}
      </div>
    </Card>
  );
}

/** List / grid switch. */
export function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      className="flex shrink-0 rounded-lg bg-white p-0.5 ring-1 ring-gray-200"
      role="group"
      aria-label="Layout"
    >
      {(
        [
          ['list', ListIcon, 'List view'],
          ['grid', LayoutGrid, 'Grid view'],
        ] as const
      ).map(([v, Icon, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          aria-label={label}
          className={`flex h-8 w-10 items-center justify-center rounded-md transition-colors ${
            view === v ? 'bg-brand-navy text-white shadow-sm' : 'text-ink-muted hover:bg-gray-100'
          }`}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** "46 Students · Academic year …" bar with the layout switch. */
export function CountBar({
  icon: Icon,
  title,
  subtitle,
  view,
  onViewChange,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}) {
  return (
    <Card className="mb-3 flex items-center gap-3 p-3 sm:mb-4 sm:px-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold leading-tight text-brand-navy sm:text-base">{title}</p>
        {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
      </div>
      <ViewToggle view={view} onChange={onViewChange} />
    </Card>
  );
}

export interface RowMenuItem {
  label: string;
  icon: LucideIcon;
  /** In-app link … */
  to?: string;
  /** … or a plain link (tel:, mailto:) … */
  href?: string;
  /** … or an action. */
  onSelect?: () => void;
  /** Shown in red (destructive actions). */
  danger?: boolean;
}

/** ⋮ menu for a row or card. The card should carry `has-[[aria-expanded=true]]:z-30`. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const itemClass =
    'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-gray-50';
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-8 w-5 items-center justify-center rounded-lg text-ink transition-colors hover:bg-gray-100"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-9 z-20 w-48 animate-slide-down overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl shadow-brand-navy/10"
        >
          {items.map(({ label: text, icon: Icon, to, href, onSelect, danger }) => {
            const cls = `${itemClass} ${danger ? 'text-red-700 hover:bg-red-50' : ''}`;
            const icon = (
              <Icon
                className={`h-4 w-4 ${danger ? 'text-red-600' : 'text-ink-muted'}`}
                aria-hidden="true"
              />
            );
            if (to)
              return (
                <Link key={text} role="menuitem" to={to} className={cls}>
                  {icon} {text}
                </Link>
              );
            if (onSelect)
              return (
                <button
                  key={text}
                  type="button"
                  role="menuitem"
                  className={cls}
                  onClick={() => {
                    setOpen(false);
                    onSelect();
                  }}
                >
                  {icon} {text}
                </button>
              );
            return (
              <a key={text} role="menuitem" href={href} className={cls}>
                {icon} {text}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
