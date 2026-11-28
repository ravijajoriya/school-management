import {
  PERMISSIONS,
  STUDENT_STATUS_LABELS,
  formatRupees,
  type StudentListItem,
  type StudentStatus,
} from '@school/shared';
import { GraduationCap, IndianRupee, Phone, ReceiptText, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { InitialsAvatar, RowMenu, type RowMenuItem } from '@/components/common/ListParts';
import { useAuth } from '@/features/auth/auth-context';
import { toneFor } from '@/lib/list-tone';

export { InitialsAvatar as StudentAvatar };

/** "Class 12 – A" pill, coloured per class; amber "Not enrolled" when there is none. */
export function ClassBadge({ student, icon = true }: { student: StudentListItem; icon?: boolean }) {
  const e = student.enrolment;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {icon && <GraduationCap className="h-3 w-3 shrink-0 text-ink" aria-hidden="true" />}
      <span
        className={`truncate rounded-full px-1.5 py-px text-[10.5px] font-medium sm:px-2 sm:py-0.5 sm:text-xs ${
          e ? toneFor(e.className) : 'bg-amber-100 text-amber-800'
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

/** ⋮ menu for a student: open record, fee ledger, collect fees, call parent. */
export function StudentMenu({ student }: { student: StudentListItem }) {
  const { can } = useAuth();
  const phone = student.primaryGuardian?.phone;
  const items: RowMenuItem[] = [
    { label: 'View student', icon: UserRound, to: `/admin/students/${student.id}` },
    ...(can(PERMISSIONS.FEES_READ)
      ? [{ label: 'Fee ledger', icon: ReceiptText, to: `/admin/fees/students/${student.id}` }]
      : []),
    ...(can(PERMISSIONS.FEES_COLLECT) && student.enrolment
      ? [
          {
            label: 'Collect fees',
            icon: IndianRupee,
            to: `/admin/fees/collect?studentId=${student.id}`,
          },
        ]
      : []),
    ...(phone ? [{ label: 'Call parent', icon: Phone, href: `tel:${phone}` }] : []),
  ];
  return <RowMenu label={`Actions for ${student.fullName}`} items={items} />;
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
      <InitialsAvatar name={s.fullName} className="h-9 w-9 text-xs" />
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
      <InitialsAvatar name={s.fullName} className="h-12 w-12 text-base" />
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
