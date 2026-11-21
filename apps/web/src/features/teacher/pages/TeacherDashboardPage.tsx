import { Card, PageHeader } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';

export function TeacherDashboardPage() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.fullName ?? ''}`}
        description="Your teaching workspace."
      />
      <Card className="p-5">
        <h2 className="font-semibold text-brand-navy">Your classes</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Assigned classes, attendance and marks entry will appear here once academic setup (Phase
          3) and attendance (Phase 4) are live.
        </p>
      </Card>
    </div>
  );
}
