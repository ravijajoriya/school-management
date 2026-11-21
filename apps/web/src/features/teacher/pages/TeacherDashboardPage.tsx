import { Link } from 'react-router';
import { Card, PageHeader } from '@/components/ui';
import { NoticeFeed } from '@/features/admin/components/NoticeFeed';
import { useAuth } from '@/features/auth/auth-context';
import { MySectionCards } from './MyClassesPage';

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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-brand-navy">Your classes</h2>
            <Link to="/teacher/classes" className="text-sm text-brand-navy hover:underline">
              View all
            </Link>
          </div>
          <MySectionCards compact />
          <p className="mt-4 text-xs text-ink-muted">
            Attendance and marks entry arrive in the next phases.
          </p>
        </Card>
        <NoticeFeed />
      </div>
    </div>
  );
}
