import {
  ENQUIRY_STATUS_LABELS,
  PAYROLL_STATUS_LABELS,
  PERMISSIONS,
  formatRupees,
  type PayrollStatus,
  type PermissionCode,
} from '@school/shared';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { Card, PageHeader, PageSpinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useOverview } from '@/features/reports/reports-api';
import { NoticeFeed } from '../components/NoticeFeed';

const SHORTCUTS: { to: string; title: string; text: string; permission: PermissionCode }[] = [
  {
    to: '/admin/website',
    title: 'Website',
    text: 'Edit and publish pages, school details and photos.',
    permission: PERMISSIONS.WEBSITE_MANAGE,
  },
  {
    to: '/admin/announcements',
    title: 'Announcements',
    text: 'Post notices on the public website.',
    permission: PERMISSIONS.ANNOUNCEMENTS_MANAGE,
  },
  {
    to: '/admin/events',
    title: 'Events',
    text: 'Publish upcoming school events.',
    permission: PERMISSIONS.EVENTS_MANAGE,
  },
  {
    to: '/admin/users',
    title: 'Users',
    text: 'Add staff accounts, assign roles, reset passwords.',
    permission: PERMISSIONS.USERS_READ,
  },
];

export function AdminDashboardPage() {
  const { user, can } = useAuth();
  const overview = useOverview();
  const o = overview.data;
  const card = (show: unknown, props: Parameters<typeof StatCard>[0]) =>
    show ? <StatCard key={props.label} {...props} /> : null;
  const groups: { title: string; cards: (JSX.Element | null)[] }[] = o
    ? [
        {
          title: 'Today',
          cards: [
            card(o.attendance, {
              to: '/admin/attendance/daily',
              label: 'Attendance today',
              value:
                o.attendance?.percentage === null || !o.attendance
                  ? '—'
                  : `${o.attendance.percentage}%`,
            }),
            card(o.attendance, {
              to: '/admin/attendance/daily',
              label: 'Classes not marked today',
              value: o.attendance?.sectionsNotMarked ?? 0,
              highlight: (o.attendance?.sectionsNotMarked ?? 0) > 0,
            }),
            card(o.leave, {
              to: '/admin/leave',
              label: 'Leave requests to review',
              value: o.leave?.pending ?? 0,
              highlight: (o.leave?.pending ?? 0) > 0,
            }),
            card(o.leave, {
              to: '/admin/leave',
              label: 'Staff on leave today',
              value: o.leave?.onLeaveToday.length ?? 0,
            }),
          ],
        },
        {
          title: 'Fees',
          cards: [
            card(o.fees, {
              to: '/admin/fees/payments',
              label: 'Fees collected today',
              value: formatRupees(o.fees?.collectedToday ?? 0),
            }),
            card(o.fees, {
              to: '/admin/fees/payments',
              label: 'Receipts today',
              value: o.fees?.receiptsToday ?? 0,
            }),
            card(o.fees, {
              to: '/admin/fees/reports',
              label: 'Overdue fees',
              value: formatRupees(o.fees?.overdueBalance ?? 0),
              highlight: (o.fees?.overdueBalance ?? 0) > 0,
            }),
            card(o.fees, {
              to: '/admin/fees/payments',
              label: 'Cheques awaiting clearance',
              value: o.fees?.chequesPending ?? 0,
              highlight: (o.fees?.chequesPending ?? 0) > 0,
            }),
          ],
        },
        {
          title: 'Students & admissions',
          cards: [
            card(o.students, {
              to: '/admin/reports',
              label: `Students${o.students?.academicYear ? ` (${o.students.academicYear})` : ''}`,
              value: o.students?.active ?? 0,
            }),
            card(o.students, {
              to: '/admin/students',
              label: 'New admissions this month',
              value: o.students?.newThisMonth ?? 0,
            }),
            card(o.enquiries, {
              to: '/admin/enquiries',
              label: 'New enquiries',
              value: o.enquiries?.byStatus.NEW ?? 0,
              highlight: (o.enquiries?.byStatus.NEW ?? 0) > 0,
            }),
            card(o.enquiries, {
              to: '/admin/enquiries',
              label: 'Follow-ups due',
              value: o.enquiries?.dueFollowUps ?? 0,
              highlight: (o.enquiries?.dueFollowUps ?? 0) > 0,
            }),
            card(o.enquiries, {
              to: '/admin/enquiries',
              label: ENQUIRY_STATUS_LABELS.ADMISSION_CONFIRMED,
              value: o.enquiries?.byStatus.ADMISSION_CONFIRMED ?? 0,
            }),
            card(o.unreadMessages !== null, {
              to: '/admin/messages',
              label: 'Unread messages',
              value: o.unreadMessages ?? 0,
              highlight: (o.unreadMessages ?? 0) > 0,
            }),
          ],
        },
        {
          title: 'Academics & operations',
          cards: [
            card(o.exams, {
              to: '/admin/exams',
              label: 'Marks awaiting approval',
              value: o.exams?.marksAwaitingApproval ?? 0,
              highlight: (o.exams?.marksAwaitingApproval ?? 0) > 0,
            }),
            card(o.complaints, {
              to: '/admin/complaints',
              label: 'Open complaints',
              value: (o.complaints?.open ?? 0) + (o.complaints?.inProgress ?? 0),
              highlight: (o.complaints?.open ?? 0) > 0,
            }),
            card(o.meetings, {
              to: '/admin/meetings',
              label: 'Parent meetings (next 7 days)',
              value: o.meetings?.next7Days ?? 0,
            }),
            card(o.transport, {
              to: '/admin/transport/vehicles',
              label: 'Vehicle renewals due',
              value: o.transport?.vehiclesDue ?? 0,
              highlight: (o.transport?.vehiclesDue ?? 0) > 0,
            }),
            card(o.inventory, {
              to: '/admin/inventory',
              label: 'Assets needing repair',
              value: o.inventory?.needsAttention ?? 0,
              highlight: (o.inventory?.needsAttention ?? 0) > 0,
            }),
            card(o.payroll, {
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

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.fullName ?? ''}`}
        description="School administration overview."
      />
      {overview.isLoading && <PageSpinner />}
      {groups
        .map((g) => ({ ...g, cards: g.cards.filter(Boolean) }))
        .filter((g) => g.cards.length)
        .map((g) => (
          <section key={g.title} className="mb-6" aria-label={g.title}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {g.title}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{g.cards}</div>
          </section>
        ))}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid h-fit gap-4 sm:grid-cols-2">
          {SHORTCUTS.filter((s) => can(s.permission)).map((s) => (
            <Link key={s.to} to={s.to}>
              <Card className="h-full p-5 transition-shadow hover:shadow-md">
                <h2 className="font-semibold text-brand-navy">{s.title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{s.text}</p>
              </Card>
            </Link>
          ))}
        </div>
        <NoticeFeed />
      </div>
    </div>
  );
}

function StatCard({
  to,
  label,
  value,
  highlight,
}: {
  to: string;
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <Link to={to}>
      <Card
        className={`p-5 transition-shadow hover:shadow-md ${highlight ? 'border-brand-gold' : ''}`}
      >
        <p className="text-sm text-ink-muted">{label}</p>
        <p
          className={`mt-1 text-3xl font-bold ${highlight ? 'text-brand-gold-dark' : 'text-brand-navy'}`}
        >
          {value}
        </p>
      </Card>
    </Link>
  );
}
