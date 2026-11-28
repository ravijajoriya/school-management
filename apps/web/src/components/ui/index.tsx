import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, CircleX, Inbox, Info, X, type LucideIcon } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/* Small, dependency-free UI kit styled with the brand tokens from index.css. */

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

// --- Button ----------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-navy text-white shadow-sm shadow-brand-navy/20 hover:bg-brand-navy-light hover:shadow-md hover:shadow-brand-navy/25',
  secondary:
    'border border-gray-300 bg-white text-ink shadow-sm hover:border-gray-400 hover:bg-gray-50',
  danger: 'bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700 hover:shadow-md',
  ghost: 'text-brand-navy hover:bg-brand-gold-light',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  size?: 'sm' | 'md';
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-1 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        buttonStyles[variant],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

// --- Form fields -----------------------------------------------------------------

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
  required,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

const controlClass = (invalid?: boolean) =>
  cx(
    // 16px text on phones: iOS Safari zooms the page when a smaller field is focused.
    'block w-full min-w-0 rounded-md border bg-white px-3 py-2 text-base text-ink transition-shadow duration-150 placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:bg-gray-100 sm:text-sm',
    invalid
      ? 'border-red-500 focus:ring-red-200'
      : 'border-gray-300 focus:border-brand-navy focus:ring-brand-gold/40',
  );

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ invalid, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(controlClass(invalid), className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(controlClass(invalid), className)}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ invalid, className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(controlClass(invalid), className)}
      {...props}
    >
      {children}
    </select>
  );
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: string }
>(function Checkbox({ label, description, className, ...props }, ref) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('flex cursor-pointer items-start gap-2 text-sm', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-brand-navy disabled:cursor-not-allowed"
        {...props}
      />
      <span>
        <span className="text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-muted">{description}</span>}
      </span>
    </label>
  );
});

// --- Feedback --------------------------------------------------------------------

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div
      className="flex min-h-[40vh] animate-fade-in flex-col items-center justify-center gap-3 text-brand-navy"
      role="status"
      aria-label="Loading"
    >
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-gold/20" />
        <Spinner className="h-8 w-8" />
      </span>
      <span className="text-xs font-medium text-ink-muted">Loading…</span>
    </div>
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info' | 'warning';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-green-200 bg-green-50 text-green-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone];
  const Icon = { error: CircleX, success: CircleCheck, info: Info, warning: CircleAlert }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex animate-fade-up items-start gap-2.5 rounded-md border px-4 py-3 text-sm',
        styles,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Badge({
  tone = 'gray',
  children,
}: {
  tone?: 'gray' | 'green' | 'red' | 'amber' | 'navy' | 'gold';
  children: ReactNode;
}) {
  const styles = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    navy: 'bg-brand-navy/10 text-brand-navy',
    gold: 'bg-brand-gold-light text-brand-gold-dark',
  }[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        styles,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex animate-fade-in flex-col items-center px-4 py-12 text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-gold-light to-brand-navy/5 text-brand-navy/60 ring-1 ring-brand-navy/5">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --- Layout ----------------------------------------------------------------------

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-xl border border-gray-200/80 bg-white shadow-sm shadow-gray-200/50',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Optional icon shown in a tile next to the title. */
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-navy to-brand-navy-light text-brand-gold shadow-md shadow-brand-navy/20 sm:flex print:hidden">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight break-words text-brand-navy sm:text-2xl">
            {title}
          </h1>
          <span
            className="mt-1.5 block h-1 w-10 rounded-full bg-gradient-to-r from-brand-gold to-brand-gold/30 print:hidden"
            aria-hidden="true"
          />
          {description && <p className="mt-2 max-w-3xl text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// --- Modal -----------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  icon: Icon,
  tone = 'navy',
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional icon tile in the header. */
  icon?: LucideIcon;
  tone?: 'navy' | 'danger' | 'success' | 'gold';
  /** Short line under the title. */
  description?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Callers often pass a new onClose on every render; keep the latest without re-running the
  // open/close effect (which would steal focus while typing).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    // Keep the page behind still, and move focus into the dialog for keyboard users.
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]):not([disabled]), select, textarea, [data-autofocus]',
    );
    (first ?? panel.current)?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  const tones = {
    navy: 'bg-brand-navy/10 text-brand-navy',
    danger: 'bg-red-100 text-red-600',
    success: 'bg-green-100 text-green-700',
    gold: 'bg-brand-gold-light text-brand-gold-dark',
  };
  // Rendered on <body>: a transformed ancestor (the page fade-in) would otherwise become the
  // containing block for `position: fixed`, clipping the dialog to the page content.
  return createPortal(
    // Phones: a bottom sheet (body scrolls, header and footer stay put). Larger screens: centred.
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:overflow-y-auto sm:p-4 sm:pt-[8vh]">
      <div
        className="fixed inset-0 animate-fade-in bg-brand-navy-dark/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full animate-sheet-up flex-col rounded-t-2xl bg-white shadow-2xl shadow-brand-navy/20 ring-1 ring-black/5 focus:outline-none sm:max-h-none sm:animate-scale-in sm:rounded-2xl',
          { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size],
        )}
      >
        <span
          className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full bg-gray-300 sm:hidden"
          aria-hidden="true"
        />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-start gap-3">
            {Icon && (
              <span
                className={cx(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  tones[tone],
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-brand-navy">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-gray-100 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children != null && children !== false && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:flex-none sm:overflow-visible sm:px-5">
            {children}
          </div>
        )}
        {footer && (
          <div className="modal-footer flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:px-5 sm:pb-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// --- Pagination ------------------------------------------------------------------

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [2, 10, 20, 50, 100],
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  /** Rows per page. With `onPageSizeChange`, a "Rows per page" selector is shown. */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** Replaces the default top border (e.g. when the pagination sits in its own card). */
  className?: string;
}) {
  const sizeId = useId();
  const size = pageSize ?? (totalPages > 0 ? Math.ceil(total / totalPages) : total);
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const last = Math.max(totalPages, 1);
  // Phones: counts and rows-per-page on one line, the page buttons centred below.
  const navButton = 'min-w-[6.5rem] text-sm sm:min-w-0 sm:px-3 sm:py-1.5 sm:text-xs';
  return (
    <div
      className={cx(
        'flex flex-col gap-3 px-3 py-3 text-xs text-ink-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4 sm:text-sm',
        className ?? 'border-t border-gray-200',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2 sm:justify-start sm:gap-x-4">
        <span aria-live="polite">
          {total === 0 ? (
            'No records'
          ) : (
            <>
              Showing <strong className="font-semibold text-ink">{from}</strong>–
              <strong className="font-semibold text-ink">{to}</strong> of{' '}
              <strong className="font-semibold text-ink">{total}</strong> record
              {total === 1 ? '' : 's'}
            </>
          )}
        </span>
        {onPageSizeChange && pageSize !== undefined && (
          <span className="flex items-center gap-1.5 border-l border-gray-200 pl-2.5 sm:gap-2 sm:pl-4">
            <label htmlFor={sizeId}>Rows per page</label>
            <select
              id={sizeId}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="keep-width rounded-md border border-gray-300 bg-white px-1 py-1 text-base sm:px-2 text-ink focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40 sm:text-sm"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 sm:gap-2">
        <Button
          variant="secondary"
          className={navButton}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </Button>
        <span className="whitespace-nowrap text-sm">
          Page <strong className="font-semibold text-ink">{Math.min(page, last)}</strong> of{' '}
          <strong className="font-semibold text-ink">{last}</strong>
        </span>
        <Button
          className={navButton}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
