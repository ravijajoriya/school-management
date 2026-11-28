import {
  PAYROLL_STATUS_LABELS,
  PERMISSIONS,
  formatRupees,
  type PayrollStatus,
  type PermissionCode,
} from '@school/shared';
import {
  ArrowRight,
  Briefcase,
  Bus,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  ChevronRight,
  ClipboardCheck,
  ClipboardX,
  FileChartColumn,
  Globe,
  GraduationCap,
  Handshake,
  Inbox,
  IndianRupee,
  Link2,
  Megaphone,
  MessageSquareWarning,
  PartyPopper,
  PhoneCall,
  TriangleAlert,
  UserCog,
  UserPlus,
  UserRoundCheck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { SectionCard } from '@/components/common/SectionCard';
import { PageSpinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useOverview } from '@/features/reports/reports-api';
import { NoticeFeed } from '../components/NoticeFeed';
import { SchoolIllustration } from '../components/SchoolIllustration';

type Tone = keyof typeof TONES;

const TONES = {
  green: {
    tile: 'bg-emerald-50 ring-emerald-100',
    icon: 'text-emerald-600',
    solid: 'bg-emerald-500',
  },
  blue: { tile: 'bg-blue-50 ring-blue-100', icon: 'text-blue-600', solid: 'bg-blue-500' },
  amber: { tile: 'bg-amber-50 ring-amber-100', icon: 'text-amber-600', solid: 'bg-amber-500' },
  orange: { tile: 'bg-orange-50 ring-orange-100', icon: 'text-orange-600', solid: 'bg-orange-500' },
  rose: { tile: 'bg-rose-50 ring-rose-100', icon: 'text-rose-600', solid: 'bg-rose-500' },
  sky: { tile: 'bg-sky-50 ring-sky-100', icon: 'text-sky-600', solid: 'bg-sky-500' },
  violet: { tile: 'bg-violet-50 ring-violet-100', icon: 'text-violet-600', solid: 'bg-violet-500' },
};

/** Most common tasks, shown in the welcome banner when the user may do them. */
const QUICK_ACTIONS: {
  to: string;
  label: string;
  permission: PermissionCode;
  icon: LucideIcon;
  tone: Tone;
}[] = [
  {
    to: '/admin/fees/collect',
    label: 'Collect Fees',
    permission: PERMISSIONS.FEES_COLLECT,
    icon: IndianRupee,
    tone: 'green',
  },
  {
    to: '/admin/students/new',
    label: 'Register Student',
    permission: PERMISSIONS.STUDENTS_MANAGE,
    icon: UserPlus,
    tone: 'blue',
  },
  {
    to: '/admin/attendance',
    label: 'Mark Attendance',
    permission: PERMISSIONS.ATTENDANCE_READ,
    icon: CalendarCheck,
    tone: 'orange',
  },
  {
    to: '/admin/reports',
    label: 'View Reports',
    permission: PERMISSIONS.STUDENTS_READ,
    icon: FileChartColumn,
    tone: 'violet',
  },
];

const QUICK_LINKS: { to: string; title: string; permission: PermissionCode; icon: LucideIcon }[] = [
  { to: '/admin/website', title: 'Website', icon: Globe, permission: PERMISSIONS.WEBSITE_MANAGE },
  {
    to: '/admin/announcements',
    title: 'Announce\u00ADments',
    icon: Megaphone,
    permission: PERMISSIONS.ANNOUNCEMENTS_MANAGE,
  },
  {
    to: '/admin/events',
    title: 'Events',
    icon: PartyPopper,
    permission: PERMISSIONS.EVENTS_MANAGE,
  },
  { to: '/admin/users', title: 'Users', icon: UserCog, permission: PERMISSIONS.USERS_READ },
];

const cardLink =
  'inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-semibold text-blue-600 hover:text-brand-navy sm:text-sm';

export function AdminDashboardPage() {
  const { user, can } = useAuth();
  const overview = useOverview();
  const o = overview.data;

  const [hour] = useState(() =>
    Number(
      new Intl.DateTimeFormat('en-IN', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: 'Asia/Kolkata',
      }).format(new Date()),
    ),
  );
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const quick = QUICK_ACTIONS.filter((q) => can(q.permission));
  const links = QUICK_LINKS.filter((s) => can(s.permission));

  const today: TileProps[] = [];
  const admissions: TileProps[] = [];
  const operations: TileProps[] = [];
  if (o?.attendance) {
    today.push(
      {
        to: '/admin/attendance/daily',
        icon: UserRoundCheck,
        tone: 'green',
        label: 'Attendance Today',
        value: o.attendance.percentage === null ? '—' : `${o.attendance.percentage}%`,
      },
      {
        to: '/admin/attendance/daily',
        icon: ClipboardX,
        tone: 'amber',
        label: 'Classes Not Marked',
        value: o.attendance.sectionsNotMarked,
      },
    );
  }
  if (o?.leave) {
    today.push(
      {
        to: '/admin/leave',
        icon: CalendarClock,
        tone: 'rose',
        label: 'Leave Requests',
        value: o.leave.pending,
      },
      {
        to: '/admin/leave',
        icon: CalendarOff,
        tone: 'sky',
        label: 'Staff on Leave',
        value: o.leave.onLeaveToday.length,
      },
    );
  }
  if (o?.students) {
    admissions.push(
      {
        to: '/admin/reports',
        icon: GraduationCap,
        tone: 'blue',
        label: 'Students',
        value: o.students.active,
      },
      {
        to: '/admin/students',
        icon: UserPlus,
        tone: 'green',
        label: 'New Admissions',
        hint: 'Admitted this month',
        value: o.students.newThisMonth,
      },
    );
  }
  if (o?.enquiries) {
    admissions.push(
      {
        to: '/admin/enquiries',
        icon: Inbox,
        tone: 'violet',
        label: 'New Enquiries',
        value: o.enquiries.byStatus.NEW ?? 0,
      },
      {
        to: '/admin/enquiries',
        icon: PhoneCall,
        tone: 'orange',
        label: 'Follow-ups Due',
        value: o.enquiries.dueFollowUps,
      },
    );
  }
  if (o?.exams)
    operations.push({
      to: '/admin/exams',
      icon: ClipboardCheck,
      tone: 'violet',
      label: 'Marks Awaiting Approval',
      value: o.exams.marksAwaitingApproval,
    });
  if (o?.complaints)
    operations.push({
      to: '/admin/complaints',
      icon: MessageSquareWarning,
      tone: 'rose',
      label: 'Open Complaints',
      value: o.complaints.open + o.complaints.inProgress,
    });
  if (o?.meetings)
    operations.push({
      to: '/admin/meetings',
      icon: Handshake,
      tone: 'sky',
      label: 'Parent Meetings (7 days)',
      value: o.meetings.next7Days,
    });
  if (o?.transport)
    operations.push({
      to: '/admin/transport/vehicles',
      icon: Bus,
      tone: 'amber',
      label: 'Vehicle Renewals Due',
      value: o.transport.vehiclesDue,
    });
  if (o?.inventory)
    operations.push({
      to: '/admin/inventory',
      icon: Wrench,
      tone: 'orange',
      label: 'Assets Needing Repair',
      value: o.inventory.needsAttention,
    });
  if (o?.payroll)
    operations.push({
      to: '/admin/payroll',
      icon: Wallet,
      tone: 'green',
      label: 'Payroll This Month',
      value: o.payroll.status
        ? PAYROLL_STATUS_LABELS[o.payroll.status as PayrollStatus]
        : 'Not started',
    });

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Welcome banner with quick actions */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy via-brand-navy-light to-brand-navy-dark p-3.5 text-white shadow-lg shadow-brand-navy/20 sm:p-6">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-400/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex items-start gap-2">
          <div className="min-w-0 flex-1 py-0.5 sm:py-2">
            <p className="text-xs font-medium text-brand-gold sm:text-sm">{greeting}</p>
            <h1 className="mt-0.5 text-lg font-bold leading-tight sm:text-3xl">
              Welcome, {user?.fullName ?? ''}
            </h1>
            <p className="mt-1 text-[11.5px] leading-snug text-white/70 sm:text-sm">
              {o?.students?.academicYear ? `Academic year ${o.students.academicYear} · ` : ''}
              Here is what needs your attention today.
            </p>
          </div>
          <div className="-mb-1 -mr-1 h-[4.75rem] w-28 shrink-0 sm:h-32 sm:w-48 [&>svg]:h-full [&>svg]:w-full">
            <SchoolIllustration />
          </div>
        </div>
        {quick.length > 0 && (
          <div
            style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}
            className="relative mt-3 grid gap-2 sm:mt-5 sm:max-w-2xl sm:gap-3"
          >
            {quick.map((q) => (
              <Link
                key={q.to}
                to={q.to}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-white px-1 py-2.5 text-center shadow-sm transition-transform hover:-translate-y-0.5 sm:flex-row sm:gap-2.5 sm:px-3 sm:text-left"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white sm:h-9 sm:w-9 ${TONES[q.tone].solid}`}
                >
                  <q.icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold leading-tight text-brand-navy sm:text-sm">
                  {q.label}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {overview.isLoading && <PageSpinner />}

      {today.length > 0 && (
        <section aria-label="Today" className="grid grid-cols-4 gap-2 sm:gap-4">
          {today.map((t) => (
            <Tile key={t.label} {...t} />
          ))}
        </section>
      )}

      {(o?.fees || admissions.length > 0) && (
        <div className="grid gap-3 sm:gap-5 lg:grid-cols-2">
          {o?.fees && (
            <SectionCard
              dense
              icon={Wallet}
              title="Fees Overview"
              actions={
                <Link to="/admin/fees/reports" className={cardLink}>
                  View Fee Ledger <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            >
              {o.fees.year ? (
                <div className="grid grid-cols-3 divide-x divide-gray-100">
                  <Money
                    icon={IndianRupee}
                    tone="green"
                    label="Billed"
                    value={formatRupees(o.fees.year.billed)}
                    note={o.fees.year.name}
                  />
                  <Money
                    icon={Wallet}
                    tone="blue"
                    label="Collected"
                    value={formatRupees(o.fees.year.collected)}
                    note={`${formatRupees(o.fees.collectedToday)} today`}
                  />
                  <Money
                    icon={TriangleAlert}
                    tone="rose"
                    label="Outstanding"
                    value={formatRupees(o.fees.year.outstanding)}
                    note={
                      o.fees.year.overdue > 0
                        ? `(${formatRupees(o.fees.year.overdue)} overdue)`
                        : 'Nothing overdue'
                    }
                    alert={o.fees.year.overdue > 0}
                  />
                </div>
              ) : (
                <p className="text-sm text-ink-muted">No active academic year.</p>
              )}
              {o.fees.chequesPending > 0 && (
                <Link
                  to="/admin/fees/payments"
                  className="mt-3 block rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100 hover:bg-amber-100"
                >
                  {o.fees.chequesPending} cheque{o.fees.chequesPending === 1 ? '' : 's'} awaiting
                  clearance
                </Link>
              )}
            </SectionCard>
          )}
          {admissions.length > 0 && (
            <section aria-labelledby="dash-admissions">
              <SectionCard
                dense
                icon={Users}
                title="Students & Admissions"
                titleId="dash-admissions"
                className="h-full"
                actions={
                  can(PERMISSIONS.STUDENTS_READ) && (
                    <Link to="/admin/students" className={cardLink}>
                      View Students <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )
                }
              >
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {admissions.map((t) => (
                    <Tile key={t.label} {...t} />
                  ))}
                </div>
              </SectionCard>
            </section>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {(operations.length > 0 || links.length > 0) && (
          <div className="grid h-fit grid-cols-[minmax(0,1fr)_minmax(0,9.25rem)] gap-2 sm:grid-cols-[minmax(0,1fr)_14rem] sm:gap-5">
            {operations.length > 0 && (
              <SectionCard
                dense
                icon={Briefcase}
                title="Academics & Operations"
                className={links.length ? '' : 'col-span-2'}
              >
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-3">
                  {operations.map((t) => (
                    <Tile key={t.label} {...t} small />
                  ))}
                </div>
              </SectionCard>
            )}
            {links.length > 0 && (
              <SectionCard
                dense
                icon={Link2}
                title="Quick Links"
                className={operations.length ? '' : 'col-span-2'}
              >
                <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
                  {links.map((s) => (
                    <Link
                      key={s.to}
                      to={s.to}
                      className="flex flex-col items-center gap-1 rounded-lg bg-gray-50 px-0.5 py-2 text-center ring-1 ring-gray-100 transition-colors hover:bg-blue-50 sm:py-3"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-brand-navy shadow-sm sm:h-9 sm:w-9">
                        <s.icon
                          className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="w-full text-[9.5px] font-semibold leading-tight text-brand-navy sm:text-xs">
                        {s.title}
                      </span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )}
        <NoticeFeed viewAllTo={can(PERMISSIONS.NOTICES_MANAGE) ? '/admin/notices' : undefined} />
      </div>
    </div>
  );
}

type TileProps = {
  to: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone: Tone;
  small?: boolean;
  /** Tooltip with more detail. */
  hint?: string;
};

/** Tinted tile: icon, value, label. */
function Tile({ to, label, value, icon: Icon, tone, small, hint }: TileProps) {
  const t = TONES[tone];
  const long = typeof value === 'string' && value.length > 4;
  return (
    <Link
      to={to}
      title={hint}
      className={`flex min-w-0 flex-col rounded-xl ring-1 transition-transform hover:-translate-y-0.5 ${t.tile} ${
        small ? 'gap-0.5 p-2 sm:p-3' : 'gap-1 p-2 sm:p-4'
      }`}
    >
      <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${t.icon}`} aria-hidden="true" />
      <span
        className={`font-bold leading-tight tracking-tight text-brand-navy ${
          long ? 'text-[13px] sm:text-lg' : small ? 'text-base sm:text-2xl' : 'text-lg sm:text-3xl'
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] leading-tight text-ink-muted sm:text-sm">{label}</span>
    </Link>
  );
}

/** One column of the fees overview. */
function Money({
  icon: Icon,
  tone,
  label,
  value,
  note,
  alert,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: string;
  note: ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="min-w-0 px-1.5 first:pl-0 last:pr-0 sm:px-4">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full ring-1 sm:h-9 sm:w-9 ${TONES[tone].tile}`}
      >
        <Icon
          className={`h-3.5 w-3.5 sm:h-[18px] sm:w-[18px] ${TONES[tone].icon}`}
          aria-hidden="true"
        />
      </span>
      <p className="mt-1.5 text-[11px] text-ink-muted sm:text-sm">{label}</p>
      <p className="truncate text-[15px] font-bold tracking-tight text-brand-navy sm:text-2xl">
        {value}
      </p>
      <p
        className={`truncate text-[10px] sm:text-xs ${alert ? 'text-rose-600' : 'text-ink-muted'}`}
      >
        {note}
      </p>
    </div>
  );
}
