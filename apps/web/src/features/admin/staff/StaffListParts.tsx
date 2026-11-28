import { EMPLOYEE_STATUS_LABELS, type EmployeeListItem } from '@school/shared';
import { Mail, Phone, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { InitialsAvatar, RowMenu, TonePill, type RowMenuItem } from '@/components/common/ListParts';
import { leaveText } from './staff-format';

const STATUS_STYLE = {
  ACTIVE: ['bg-green-100 text-green-700', 'bg-green-600'],
  INACTIVE: ['bg-gray-100 text-gray-600', 'bg-gray-400'],
  LEFT: ['bg-red-100 text-red-700', 'bg-red-500'],
  ON_LEAVE: ['bg-orange-100 text-orange-600', 'bg-orange-500'],
} as const;

/** Status with a dot: On Leave (today) wins over Active. */
export function StaffStatusPill({ employee: e }: { employee: EmployeeListItem }) {
  const key = e.onLeave && e.status === 'ACTIVE' ? 'ON_LEAVE' : e.status;
  const [pill, dot] = STATUS_STYLE[key];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium sm:text-xs ${pill}`}
      title={e.onLeave ? leaveText(e.onLeave) : undefined}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {key === 'ON_LEAVE' ? 'On Leave' : EMPLOYEE_STATUS_LABELS[e.status]}
    </span>
  );
}

/** ⋮ menu for a staff member: open record, call, email. */
export function StaffMenu({ employee: e }: { employee: EmployeeListItem }) {
  const items: RowMenuItem[] = [
    { label: 'View staff', icon: UserRound, to: `/admin/staff/${e.id}` },
    ...(e.phone ? [{ label: 'Call', icon: Phone, href: `tel:${e.phone}` }] : []),
    ...(e.email ? [{ label: 'Email', icon: Mail, href: `mailto:${e.email}` }] : []),
  ];
  return <RowMenu label={`Actions for ${e.fullName}`} items={items} />;
}

/** List row on phones: avatar, name / code / designation, phone and status, ⋮. */
export function StaffCard({ employee: e }: { employee: EmployeeListItem }) {
  return (
    <div
      className={`relative flex items-center gap-2 rounded-xl border bg-white p-2.5 shadow-sm shadow-gray-200/50 transition-shadow hover:shadow-md has-[[aria-expanded=true]]:z-30 ${
        e.onLeave ? 'border-orange-200' : 'border-gray-200/80'
      }`}
    >
      <InitialsAvatar name={e.fullName} className="h-9 w-9 text-xs" />
      <div className="min-w-0 flex-1">
        <Link
          to={`/admin/staff/${e.id}`}
          className="block truncate text-[13px] font-bold leading-snug text-brand-navy after:absolute after:inset-0 after:content-['']"
          title={e.fullName}
        >
          {e.fullName}
        </Link>
        <p className="truncate text-[10.5px] leading-snug text-ink-muted">{e.employeeCode}</p>
        <div className="mt-0.5 flex min-w-0" title={e.designation}>
          <TonePill>{e.designation}</TonePill>
        </div>
      </div>
      <span className="h-10 w-px shrink-0 bg-gray-200" aria-hidden="true" />
      <div className="w-[6.25rem] shrink-0 space-y-1 text-[11.5px] text-ink">
        {e.phone ? (
          <a
            href={`tel:${e.phone}`}
            className="relative z-10 flex items-center gap-1 whitespace-nowrap hover:text-brand-navy"
          >
            <Phone className="h-3 w-3 shrink-0 text-ink-muted" aria-hidden="true" />
            {e.phone}
          </a>
        ) : (
          <p className="text-ink-muted">No phone</p>
        )}
        <StaffStatusPill employee={e} />
      </div>
      <div className="relative z-10 shrink-0">
        <StaffMenu employee={e} />
      </div>
    </div>
  );
}

/** Grid tile: avatar, name, code, designation, status, phone, ⋮. */
export function StaffTile({ employee: e }: { employee: EmployeeListItem }) {
  return (
    <div
      className={`relative flex flex-col items-center rounded-xl border bg-white p-3 text-center shadow-sm shadow-gray-200/50 transition-shadow hover:shadow-md has-[[aria-expanded=true]]:z-30 ${
        e.onLeave ? 'border-orange-200' : 'border-gray-200/80'
      }`}
    >
      <div className="absolute right-1.5 top-1.5 z-10">
        <StaffMenu employee={e} />
      </div>
      <InitialsAvatar name={e.fullName} className="h-12 w-12 text-base" />
      <Link
        to={`/admin/staff/${e.id}`}
        className="mt-2 block w-full truncate text-sm font-bold text-brand-navy after:absolute after:inset-0 after:content-['']"
      >
        {e.fullName}
      </Link>
      <p className="w-full truncate text-[11px] text-ink-muted">{e.employeeCode}</p>
      <div className="mt-1.5 flex max-w-full">
        <TonePill>{e.designation}</TonePill>
      </div>
      <div className="mt-2">
        <StaffStatusPill employee={e} />
      </div>
      {e.phone && <p className="mt-1.5 text-[11px] text-ink-muted">{e.phone}</p>}
    </div>
  );
}
