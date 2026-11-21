import { ENQUIRY_STATUS_LABELS, PERMISSIONS, type PermissionCode } from '@school/shared';
import { Link } from 'react-router';
import { Card, PageHeader } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useEnquirySummary, useUnreadMessages } from '../cms-api';
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
  const summary = useEnquirySummary(can(PERMISSIONS.ENQUIRIES_READ));
  const unread = useUnreadMessages(can(PERMISSIONS.CONTACT_MESSAGES_MANAGE));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.fullName ?? ''}`}
        description="School administration overview."
      />

      {(summary.data || unread.data !== undefined) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summary.data && (
            <>
              <StatCard
                to="/admin/enquiries"
                label="New enquiries"
                value={summary.data.byStatus.NEW}
                highlight={summary.data.byStatus.NEW > 0}
              />
              <StatCard
                to="/admin/enquiries"
                label="Follow-ups due"
                value={summary.data.dueFollowUps}
                highlight={summary.data.dueFollowUps > 0}
              />
              <StatCard
                to="/admin/enquiries"
                label={ENQUIRY_STATUS_LABELS.ADMISSION_CONFIRMED}
                value={summary.data.byStatus.ADMISSION_CONFIRMED}
              />
            </>
          )}
          {unread.data !== undefined && (
            <StatCard
              to="/admin/messages"
              label="Unread messages"
              value={unread.data}
              highlight={unread.data > 0}
            />
          )}
        </div>
      )}

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
  value: number;
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
