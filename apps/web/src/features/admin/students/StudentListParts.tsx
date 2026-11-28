import {
  PERMISSIONS,
  STUDENT_STATUS_LABELS,
  formatRupees,
  type StudentListItem,
  type StudentStatus,
} from '@school/shared';
import {
  ChevronDown,
  EllipsisVertical,
  GraduationCap,
  IndianRupee,
  Phone,
  ReceiptText,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { initials } from './student-format';

const PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-emerald-100 text-emerald-700',
] as const;
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const tone = (key: string) => PALETTE[hash(key) % PALETTE.length];

/** Initials in a soft coloured circle (same colour for the same name). */
export function StudentAvatar({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${tone(name)} ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** "Class 12 – A" pill, coloured per class; amber "Not enrolled" when there is none. */
export function ClassBadge({ student, icon = true }: { student: StudentListItem; icon?: boolean }) {
  const e = student.enrolment;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {icon && <GraduationCap className="h-3 w-3 shrink-0 text-ink" aria-hidden="true" />}
      <span
        className={`truncate rounded-full px-1.5 py-px text-[10.5px] font-medium sm:px-2 sm:py-0.5 sm:text-xs ${
          e ? tone(e.className) : 'bg-amber-100 text-amber-800'
        }`}
      >
        {e ? `${e.className} – ${e.sectionName}` : 'Not enrolled'}
      </span>
    </span>
  );
}

/** Pending fees as a red amount or a green "Nil" pill (null = no fee access). */
export function FeesPill({ amount }: { amount: number | null }) {
  if (amount === null) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${
        amount ? 'bg-red-100 text-red-600' : 'min-w-[2.75rem] bg-green-100 text-green-700'
      }`}
      title={amount ? 'Fees due up to today' : 'No fees due'}
    >
      {amount ? formatRupees(amount) : 'Nil'}
    </span>
  );
}

const STATUS_DOT: Record<StudentStatus | '', string> = {
  '': 'bg-gray-300',
  ACTIVE: 'bg-green-500',
  INACTIVE: 'bg-gray-400',
  WITHDRAWN: 'bg-red-500',
};

export function StatusDot({ status }: { status: StudentStatus | '' }) {
  return <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />;
}

/** A select with an icon (or dot) inside on the left and a chevron on the right. */
export function IconSelect({
  icon: Icon,
  leading,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: LucideIcon; leading?: ReactNode }) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-ink">
        {leading ?? (Icon && <Icon className="h-4 w-4" aria-hidden="true" />)}
      </span>
      <select
        {...props}
        className="block w-full min-w-0 appearance-none truncate rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-6 text-base text-ink transition-shadow focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40 disabled:bg-gray-100 disabled:text-ink-muted sm:text-sm"
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

/** ⋮ menu for a student: open record, fee ledger, collect fees, call parent. */
export function StudentMenu({ student }: { student: StudentListItem }) {
  const { can } = useAuth();
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
  const item =
    'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-gray-50';
  const phone = student.primaryGuardian?.phone;
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
        aria-label={`Actions for ${student.fullName}`}
      >
        <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-9 z-20 w-48 animate-slide-down overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl shadow-brand-navy/10"
        >
          <Link role="menuitem" to={`/admin/students/${student.id}`} className={item}>
            <UserRound className="h-4 w-4 text-ink-muted" aria-hidden="true" /> View student
          </Link>
          {can(PERMISSIONS.FEES_READ) && (
            <Link role="menuitem" to={`/admin/fees/students/${student.id}`} className={item}>
              <ReceiptText className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Fee ledger
            </Link>
          )}
          {can(PERMISSIONS.FEES_COLLECT) && student.enrolment && (
            <Link
              role="menuitem"
              to={`/admin/fees/collect?studentId=${student.id}`}
              className={item}
            >
              <IndianRupee className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Collect fees
            </Link>
          )}
          {phone && (
            <a role="menuitem" href={`tel:${phone}`} className={item}>
              <Phone className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Call parent
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const statusNote = (s: StudentListItem) =>
  s.status === 'ACTIVE' ? null : (
    <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-px text-[10px] font-medium text-gray-600">
      {STUDENT_STATUS_LABELS[s.status]}
    </span>
  );

/** List row on phones: avatar, name / admission no. / class, parent and phone, fees, ⋮. */
export function StudentCard({ student: s }: { student: StudentListItem }) {
  return (
    <div className="relative flex items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white p-2.5 shadow-sm shadow-gray-200/50 transition-shadow hover:shadow-md has-[[aria-expanded=true]]:z-30">
      <StudentAvatar name={s.fullName} className="h-9 w-9 text-xs" />
      <div className="min-w-0 flex-1">
        <Link
          to={`/admin/students/${s.id}`}
          className="block truncate text-[13px] font-bold leading-snug text-brand-navy after:absolute after:inset-0 after:content-['']"
          title={s.fullName}
        >
          {s.fullName}
        </Link>
        <p className="truncate text-[10.5px] leading-snug text-ink-muted">
          {s.admissionNumber}
          {statusNote(s)}
        </p>
        <div className="mt-0.5 flex min-w-0">
          <ClassBadge student={s} />
        </div>
      </div>
      <span className="h-10 w-px shrink-0 bg-gray-200" aria-hidden="true" />
      <div className="w-[5.4rem] shrink-0 space-y-0.5 text-[11.5px] text-ink">
        {s.primaryGuardian ? (
          <>
            <p className="flex min-w-0 items-center gap-1" title={s.primaryGuardian.fullName}>
              <UserRound className="h-3 w-3 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="truncate">{s.primaryGuardian.fullName}</span>
            </p>
            <a
              href={`tel:${s.primaryGuardian.phone}`}
              className="relative z-10 flex items-center gap-1 whitespace-nowrap hover:text-brand-navy"
            >
              <Phone className="h-3 w-3 shrink-0 text-ink-muted" aria-hidden="true" />
              {s.primaryGuardian.phone}
            </a>
          </>
        ) : (
          <p className="text-ink-muted">No parent</p>
        )}
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        {s.pendingFees !== null && (
          <span className="flex w-[3.85rem] justify-end">
            <FeesPill amount={s.pendingFees} />
          </span>
        )}
        <StudentMenu student={s} />
      </div>
    </div>
  );
}

/** Grid tile: avatar, name, admission no., class, fees, ⋮. */
export function StudentTile({ student: s }: { student: StudentListItem }) {
  return (
    <div className="relative flex flex-col items-center rounded-xl border border-gray-200/80 bg-white p-3 text-center shadow-sm shadow-gray-200/50 transition-shadow hover:shadow-md has-[[aria-expanded=true]]:z-30">
      <div className="absolute right-1.5 top-1.5 z-10">
        <StudentMenu student={s} />
      </div>
      <StudentAvatar name={s.fullName} className="h-12 w-12 text-base" />
      <Link
        to={`/admin/students/${s.id}`}
        className="mt-2 block w-full truncate text-sm font-bold text-brand-navy after:absolute after:inset-0 after:content-['']"
      >
        {s.fullName}
      </Link>
      <p className="w-full truncate text-[11px] text-ink-muted">
        {s.admissionNumber}
        {statusNote(s)}
      </p>
      <div className="mt-1.5 flex max-w-full">
        <ClassBadge student={s} icon={false} />
      </div>
      {s.primaryGuardian && (
        <p className="mt-1.5 w-full truncate text-[11px] text-ink-muted">
          {s.primaryGuardian.fullName}
        </p>
      )}
      {s.pendingFees !== null && (
        <div className="mt-2">
          <FeesPill amount={s.pendingFees} />
        </div>
      )}
    </div>
  );
}
