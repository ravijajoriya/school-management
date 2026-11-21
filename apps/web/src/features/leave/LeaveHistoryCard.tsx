import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, type LeaveStatus } from '@school/shared';
import { Link } from 'react-router';
import { Badge, Card, PageSpinner } from '@/components/ui';
import { leaveDates } from './format';
import { useLeaveRequests } from './leave-api';

const STATUS_TONE: Record<LeaveStatus, 'amber' | 'green' | 'red' | 'gray'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'gray',
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

/** Leave history on a staff member's page (office). */
export function LeaveHistoryCard({ employeeId }: { employeeId: string }) {
  const list = useLeaveRequests({ employeeId, pageSize: 10 });
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand-navy">Leave</h2>
        <Link to="/admin/leave" className="text-sm text-brand-navy hover:underline">
          All requests
        </Link>
      </div>
      {list.isLoading ? (
        <PageSpinner />
      ) : !list.data?.items.length ? (
        <p className="mt-2 text-sm text-ink-muted">No leave requests.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {list.data.items.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {LEAVE_TYPE_LABELS[l.leaveType]} · {leaveDates(l)}{' '}
                <span className="text-ink-muted">({l.days}d)</span>
              </span>
              <LeaveStatusBadge status={l.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
