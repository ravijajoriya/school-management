import { Card, PageHeader } from '@/components/ui';
import { NoticeFeed } from '@/features/admin/components/NoticeFeed';
import { useAuth } from '@/features/auth/auth-context';

export function TeacherDashboardPage() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.fullName ?? ''}`}
        description="Your teaching workspace."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="h-fit p-5">
          <h2 className="font-semibold text-brand-navy">Your classes</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Assigned classes, attendance and marks entry will appear here once academic setup (Phase
            3) and attendance (Phase 4) are live.
          </p>
        </Card>
        <NoticeFeed />
      </div>
    </div>
  );
}
