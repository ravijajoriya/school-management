import { LEAVE_TYPE_LABELS, type EmployeeListItem, type LeaveType } from '@school/shared';
import { formatDate } from '@/lib/format';

/** "Sick / medical leave until 26 Nov 2026". */
export function leaveText(l: NonNullable<EmployeeListItem['onLeave']>) {
  const type = LEAVE_TYPE_LABELS[l.leaveType as LeaveType] ?? l.leaveType;
  return `${/leave/i.test(type) ? type : `${type} leave`} until ${formatDate(l.endDate)}`;
}
