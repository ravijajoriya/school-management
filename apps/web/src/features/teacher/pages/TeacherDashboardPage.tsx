import { LEAVE_TYPE_LABELS, PERMISSIONS } from '@school/shared';
import { Link } from 'react-router';
import { Card, PageHeader } from '@/components/ui';
import { NoticeFeed } from '@/features/admin/components/NoticeFeed';
import { TodayAttendanceCards } from '@/features/attendance/pages/TeacherAttendancePages';
import { useAuth } from '@/features/auth/auth-context';
import { leaveDates } from '@/features/leave/format';
import { LeaveStatusBadge } from '@/features/leave/LeaveHistoryCard';
import { useMyLeave } from '@/features/leave/leave-api';
import { todayIso } from '@/lib/format';
import { MySectionCards } from './MyClassesPage';

export function TeacherDashboardPage() {
  const { user, can } = useAuth();
  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.fullName ?? ''}`}
        description="Your teaching workspace."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {can(PERMISSIONS.ATTENDANCE_MARK) && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-brand-navy">Today's attendance</h2>
                <Link to="/teacher/attendance" className="text-sm text-brand-navy hover:underline">
                  Open
                </Link>
              </div>
              <TodayAttendanceCards compact />
            </Card>
          )}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-brand-navy">Your classes</h2>
              <Link to="/teacher/classes" className="text-sm text-brand-navy hover:underline">
                View all
              </Link>
            </div>
            <MySectionCards compact />
          </Card>
        </div>
        <div className="space-y-6">
          {can(PERMISSIONS.LEAVE_APPLY) && <UpcomingLeaveCard />}
          <NoticeFeed />
        </div>
      </div>
    </div>
  );
}

function UpcomingLeaveCard() {
  const mine = useMyLeave();
  const today = todayIso();
  const upcoming = (mine.data ?? []).filter(
    (l) => (l.status === 'PENDING' || l.status === 'APPROVED') && l.endDate >= today,
  );
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-brand-navy">My leave</h2>
        <Link to="/teacher/leave" className="text-sm text-brand-navy hover:underline">
          Apply / history
        </Link>
      </div>
      {mine.isError ? (
        <p className="text-sm text-ink-muted">
          Leave is available once your login is linked to your staff record.
        </p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-ink-muted">No upcoming leave.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {upcoming.slice(0, 4).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <span>
                {LEAVE_TYPE_LABELS[l.leaveType]} · {leaveDates(l)}
              </span>
              <LeaveStatusBadge status={l.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
