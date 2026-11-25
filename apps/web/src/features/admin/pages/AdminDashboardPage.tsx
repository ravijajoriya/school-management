import {
  ENQUIRY_STATUS_LABELS,
  PAYROLL_STATUS_LABELS,
  PERMISSIONS,
  formatRupees,
  type PayrollStatus,
  type PermissionCode,
} from '@school/shared';
import {
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Bus,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  ClipboardCheck,
  ClipboardX,
  FileChartColumn,
  Globe,
  GraduationCap,
  Handshake,
  Inbox,
  IndianRupee,
  Landmark,
  Mail,
  Megaphone,
  MessageSquareWarning,
  PartyPopper,
  PhoneCall,
  Receipt,
  Sparkles,
  Sun,
  UserCog,
  UserPlus,
  UserRoundCheck,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useState, type JSX } from 'react';
import { Link } from 'react-router';
import { Card, PageSpinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useOverview } from '@/features/reports/reports-api';
import { NoticeFeed } from '../components/NoticeFeed';

const SHORTCUTS: {
  to: string;
  title: string;
  text: string;
  permission: PermissionCode;
  icon: LucideIcon;
}[] = [
  {
    to: '/admin/website',
    title: 'Website',
    icon: Globe,
    text: 'Edit and publish pages, school details and photos.',
    permission: PERMISSIONS.WEBSITE_MANAGE,
  },
  {
    to: '/admin/announcements',
    title: 'Announcements',
    icon: Megaphone,
    text: 'Post notices on the public website.',
    permission: PERMISSIONS.ANNOUNCEMENTS_MANAGE,
  },
  {
    to: '/admin/events',
    title: 'Events',
    icon: PartyPopper,
    text: 'Publish upcoming school events.',
    permission: PERMISSIONS.EVENTS_MANAGE,
  },
  {
    to: '/admin/users',
    title: 'Users',
    icon: UserCog,
    text: 'Add staff accounts, assign roles, reset passwords.',
    permission: PERMISSIONS.USERS_READ,
  },
];

/** Most common tasks, shown in the welcome banner when the user may do them. */
const QUICK_ACTIONS: { to: string; label: string; permission: PermissionCode; icon: LucideIcon }[] =
  [
    {
      to: '/admin/fees/collect',
      label: 'Collect fees',
      permission: PERMISSIONS.FEES_COLLECT,
      icon: IndianRupee,
    },
    {
      to: '/admin/students/new',
      label: 'Register student',
      permission: PERMISSIONS.STUDENTS_MANAGE,
      icon: UserPlus,
    },
    {
      to: '/admin/attendance',
      label: 'Attendance',
      permission: PERMISSIONS.ATTENDANCE_READ,
      icon: CalendarCheck,
    },
    {
      to: '/admin/reports',
      label: 'Reports',
      permission: PERMISSIONS.STUDENTS_READ,
      icon: FileChartColumn,
    },
  ];

export function AdminDashboardPage() {
  const { user, can } = useAuth();
  const overview = useOverview();
  const o = overview.data;
  const card = (show: unknown, props: Parameters<typeof StatCard>[0]) =>
    show ? <StatCard key={props.label} {...props} /> : null;
  const groups: { title: string; icon: LucideIcon; cards: (JSX.Element | null)[] }[] = o
    ? [
        {
          title: 'Today',
          icon: Sun,
          cards: [
            card(o.attendance, {
              icon: UserRoundCheck,
              tone: 'green',
              to: '/admin/attendance/daily',
              label: 'Attendance today',
              value:
                o.attendance?.percentage === null || !o.attendance
                  ? '—'
                  : `${o.attendance.percentage}%`,
            }),
            card(o.attendance, {
              icon: ClipboardX,
              tone: 'amber',
              to: '/admin/attendance/daily',
              label: 'Classes not marked today',
              value: o.attendance?.sectionsNotMarked ?? 0,
              highlight: (o.attendance?.sectionsNotMarked ?? 0) > 0,
            }),
            card(o.leave, {
              icon: CalendarClock,
              tone: 'amber',
              to: '/admin/leave',
              label: 'Leave requests to review',
              value: o.leave?.pending ?? 0,
              highlight: (o.leave?.pending ?? 0) > 0,
            }),
            card(o.leave, {
              icon: CalendarOff,
              tone: 'sky',
              to: '/admin/leave',
              label: 'Staff on leave today',
              value: o.leave?.onLeaveToday.length ?? 0,
            }),
          ],
        },
        {
          title: 'Fees',
          icon: Wallet,
          cards: [
            card(o.fees, {
              icon: IndianRupee,
              tone: 'green',
              to: '/admin/fees/payments',
              label: 'Fees collected today',
              value: formatRupees(o.fees?.collectedToday ?? 0),
            }),
            card(o.fees, {
              icon: Receipt,
              tone: 'navy',
              to: '/admin/fees/payments',
              label: 'Receipts today',
              value: o.fees?.receiptsToday ?? 0,
            }),
            card(o.fees, {
              icon: AlarmClock,
              tone: 'rose',
              to: '/admin/fees/reports',
              label: 'Overdue fees',
              value: formatRupees(o.fees?.overdueBalance ?? 0),
              highlight: (o.fees?.overdueBalance ?? 0) > 0,
            }),
            card(o.fees, {
              icon: Landmark,
              tone: 'amber',
              to: '/admin/fees/payments',
              label: 'Cheques awaiting clearance',
              value: o.fees?.chequesPending ?? 0,
              highlight: (o.fees?.chequesPending ?? 0) > 0,
            }),
          ],
        },
        {
          title: 'Students & admissions',
          icon: GraduationCap,
          cards: [
            card(o.students, {
              icon: GraduationCap,
              tone: 'navy',
              to: '/admin/reports',
              label: `Students${o.students?.academicYear ? ` (${o.students.academicYear})` : ''}`,
              value: o.students?.active ?? 0,
            }),
            card(o.students, {
              icon: UserPlus,
              tone: 'green',
              to: '/admin/students',
              label: 'New admissions this month',
              value: o.students?.newThisMonth ?? 0,
            }),
            card(o.enquiries, {
              icon: Inbox,
              tone: 'sky',
              to: '/admin/enquiries',
              label: 'New enquiries',
              value: o.enquiries?.byStatus.NEW ?? 0,
              highlight: (o.enquiries?.byStatus.NEW ?? 0) > 0,
            }),
            card(o.enquiries, {
              icon: PhoneCall,
              tone: 'amber',
              to: '/admin/enquiries',
              label: 'Follow-ups due',
              value: o.enquiries?.dueFollowUps ?? 0,
              highlight: (o.enquiries?.dueFollowUps ?? 0) > 0,
            }),
            card(o.enquiries, {
              icon: BadgeCheck,
              tone: 'green',
              to: '/admin/enquiries',
              label: ENQUIRY_STATUS_LABELS.ADMISSION_CONFIRMED,
              value: o.enquiries?.byStatus.ADMISSION_CONFIRMED ?? 0,
            }),
            card(o.unreadMessages !== null, {
              icon: Mail,
              tone: 'violet',
              to: '/admin/messages',
              label: 'Unread messages',
              value: o.unreadMessages ?? 0,
              highlight: (o.unreadMessages ?? 0) > 0,
            }),
          ],
        },
        {
          title: 'Academics & operations',
          icon: Briefcase,
          cards: [
            card(o.exams, {
              icon: ClipboardCheck,
              tone: 'violet',
              to: '/admin/exams',
              label: 'Marks awaiting approval',
              value: o.exams?.marksAwaitingApproval ?? 0,
              highlight: (o.exams?.marksAwaitingApproval ?? 0) > 0,
            }),
            card(o.complaints, {
              icon: MessageSquareWarning,
              tone: 'rose',
              to: '/admin/complaints',
              label: 'Open complaints',
              value: (o.complaints?.open ?? 0) + (o.complaints?.inProgress ?? 0),
              highlight: (o.complaints?.open ?? 0) > 0,
            }),
            card(o.meetings, {
              icon: Handshake,
              tone: 'sky',
              to: '/admin/meetings',
              label: 'Parent meetings (next 7 days)',
              value: o.meetings?.next7Days ?? 0,
            }),
            card(o.transport, {
              icon: Bus,
              tone: 'amber',
              to: '/admin/transport/vehicles',
              label: 'Vehicle renewals due',
              value: o.transport?.vehiclesDue ?? 0,
              highlight: (o.transport?.vehiclesDue ?? 0) > 0,
            }),
            card(o.inventory, {
              icon: Wrench,
              tone: 'rose',
              to: '/admin/inventory',
              label: 'Assets needing repair',
              value: o.inventory?.needsAttention ?? 0,
              highlight: (o.inventory?.needsAttention ?? 0) > 0,
            }),
            card(o.payroll, {
              icon: Wallet,
              tone: 'navy',
              to: '/admin/payroll',
              label: 'Payroll this month',
              value: o.payroll?.status
                ? PAYROLL_STATUS_LABELS[o.payroll.status as PayrollStatus]
                : 'Not started',
            }),
          ],
        },
      ]
    : [];

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
  let delay = 0;

  return (
    <div>
      <section className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy via-brand-navy-light to-brand-navy-dark p-6 text-white shadow-xl shadow-brand-navy/20 sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-gold/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-brand-gold">
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {greeting}
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Welcome, {user?.fullName ?? ''}</h1>
            <p className="mt-1 text-sm text-white/70">
              {o?.students?.academicYear ? `Academic year ${o.students.academicYear} · ` : ''}
              Here is what needs your attention today.
            </p>
          </div>
          {quick.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <Link
                  key={q.to}
                  to={q.to}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
                >
                  <q.icon className="h-4 w-4 text-brand-gold" aria-hidden="true" />
                  {q.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {overview.isLoading && <PageSpinner />}
      {groups
        .map((g) => ({ ...g, cards: g.cards.filter(Boolean) }))
        .filter((g) => g.cards.length)
        .map((g) => (
          <section key={g.title} className="mb-8" aria-label={g.title}>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <g.icon className="h-4 w-4 text-brand-gold-dark" aria-hidden="true" />
              {g.title}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {g.cards.map((c) => (
                <div
                  key={c!.key}
                  className="animate-fade-up"
                  style={{ animationDelay: `${delay++ * 40}ms` }}
                >
                  {c}
                </div>
              ))}
            </div>
          </section>
        ))}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid h-fit gap-4 sm:grid-cols-2">
          {SHORTCUTS.filter((s) => can(s.permission)).map((s) => (
            <Link key={s.to} to={s.to} className="group">
              <Card className="flex h-full items-start gap-4 p-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-brand-navy/10">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gold-light text-brand-gold-dark transition-colors group-hover:bg-brand-navy group-hover:text-brand-gold">
                  <s.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="flex items-center gap-1 font-semibold text-brand-navy">
                    {s.title}
                    <ArrowRight
                      className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-1 block text-sm text-ink-muted">{s.text}</span>
                </span>
              </Card>
            </Link>
          ))}
        </div>
        <NoticeFeed />
      </div>
    </div>
  );
}

const TONES = {
  navy: 'bg-brand-navy/10 text-brand-navy',
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
};

function StatCard({
  to,
  label,
  value,
  highlight,
  icon: Icon,
  tone = 'navy',
}: {
  to: string;
  label: string;
  value: number | string;
  highlight?: boolean;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
}) {
  return (
    <Link to={to} className="group block h-full">
      <Card
        className={`relative h-full overflow-hidden p-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-brand-navy/10 ${
          highlight ? 'border-brand-gold/70 ring-1 ring-brand-gold/30' : ''
        }`}
      >
        {highlight && (
          <span className="absolute right-4 top-4 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-gold opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-gold" />
          </span>
        )}
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${TONES[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm text-ink-muted">{label}</p>
        <p
          className={`mt-0.5 text-3xl font-bold tracking-tight ${highlight ? 'text-brand-gold-dark' : 'text-brand-navy'}`}
        >
          {value}
        </p>
      </Card>
    </Link>
  );
}
