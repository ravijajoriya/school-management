import { PERMISSIONS, type PermissionCode } from '@school/shared';
import { Link } from 'react-router';
import { Card, PageHeader } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';

const SHORTCUTS: { to: string; title: string; text: string; permission: PermissionCode }[] = [
  {
    to: '/admin/users',
    title: 'Users',
    text: 'Add staff accounts, assign roles, reset passwords.',
    permission: PERMISSIONS.USERS_READ,
  },
  {
    to: '/admin/roles',
    title: 'Roles & Permissions',
    text: 'Decide what each role can see and do.',
    permission: PERMISSIONS.ROLES_READ,
  },
  {
    to: '/admin/audit-logs',
    title: 'Audit Logs',
    text: 'Review sign-ins and administrative changes.',
    permission: PERMISSIONS.AUDIT_LOGS_READ,
  },
];

export function AdminDashboardPage() {
  const { user, can } = useAuth();
  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.fullName ?? ''}`}
        description="School administration overview."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {SHORTCUTS.filter((s) => can(s.permission)).map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="h-full p-5 transition-shadow hover:shadow-md">
              <h2 className="font-semibold text-brand-navy">{s.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{s.text}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mt-6 p-5">
        <h2 className="font-semibold text-brand-navy">Coming next</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Website content &amp; admission enquiries (Phase 2), then academic setup, staff and
          students (Phase 3).
        </p>
      </Card>
    </div>
  );
}
