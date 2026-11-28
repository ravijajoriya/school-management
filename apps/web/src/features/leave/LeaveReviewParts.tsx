import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  type LeaveRequestItem,
  type LeaveStatus,
} from '@school/shared';
import {
  Ban,
  CalendarClock,
  CalendarDays,
  Check,
  CircleCheck,
  CircleX,
  Hourglass,
  MessageSquareText,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { InitialsAvatar } from '@/components/common/ListParts';
import { Button } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { leaveDates, shortLeaveDates } from './format';

const STATUS_LOOK: Record<LeaveStatus, { icon: LucideIcon; pill: string; border: string }> = {
  PENDING: { icon: Hourglass, pill: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400' },
  APPROVED: {
    icon: CircleCheck,
    pill: 'bg-green-100 text-green-700',
    border: 'border-l-green-500',
  },
  REJECTED: { icon: CircleX, pill: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
  CANCELLED: { icon: Ban, pill: 'bg-gray-100 text-gray-600', border: 'border-l-gray-300' },
};

/** Status pill with its icon (Pending amber, Approved green, Rejected red, Cancelled grey). */
export function LeaveStatusPill({ status }: { status: LeaveStatus }) {
  const look = STATUS_LOOK[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:px-2.5 sm:py-1 sm:text-xs ${look.pill}`}
    >
      <look.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
      {LEAVE_STATUS_LABELS[status]}
    </span>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
  className = '',
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 gap-1.5 sm:gap-2 ${className}`}>
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted sm:h-4 sm:w-4"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[10.5px] text-ink-muted sm:text-xs">{label}</p>
        <p className="text-[12px] font-semibold leading-snug text-ink sm:text-sm">{children}</p>
      </div>
    </div>
  );
}

/** One leave request: who, status, type / dates / days, reason, review, and Approve / Reject. */
export function LeaveCard({
  leave: l,
  canReview,
  onReview,
}: {
  leave: LeaveRequestItem;
  canReview: boolean;
  onReview: (decision: 'approve' | 'reject') => void;
}) {
  return (
    <li
      aria-label={`${l.employee.fullName}, ${leaveDates(l)}`}
      className={`rounded-xl border border-l-4 border-gray-200/80 bg-white p-3 shadow-sm shadow-gray-200/50 sm:p-4 ${STATUS_LOOK[l.status].border}`}
    >
      <div className="flex items-start gap-2.5">
        <InitialsAvatar name={l.employee.fullName} className="h-10 w-10 text-sm sm:h-11 sm:w-11" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/admin/staff/${l.employee.id}`}
            className="block truncate text-[14px] font-bold leading-snug text-brand-navy hover:underline sm:text-base"
          >
            {l.employee.fullName}
          </Link>
          <p className="truncate text-[11.5px] text-ink-muted sm:text-[13px]">
            {l.employee.employeeCode} · {l.employee.designation}
          </p>
        </div>
        <LeaveStatusPill status={l.status} />
      </div>

      <div className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 border-t border-gray-100 pt-2.5 sm:gap-x-3">
        <Fact icon={CalendarDays} label="Leave Type">
          {LEAVE_TYPE_LABELS[l.leaveType]}
        </Fact>
        <Fact
          icon={CalendarDays}
          label="Duration"
          className="border-l border-gray-100 pl-2 sm:pl-3"
        >
          <span title={leaveDates(l)}>{shortLeaveDates(l)}</span>
        </Fact>
        <Fact icon={CalendarClock} label="Total" className="border-l border-gray-100 pl-2 sm:pl-3">
          <span className="whitespace-nowrap">
            {l.days} day{l.days === 1 ? '' : 's'}
          </span>
        </Fact>
      </div>

      <div className="mt-2.5 flex gap-1.5 sm:gap-2">
        <MessageSquareText
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted sm:h-4 sm:w-4"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-[10.5px] text-ink-muted sm:text-xs">Reason</p>
          <p className="whitespace-pre-line break-words text-[12.5px] text-ink sm:text-sm">
            {l.reason}
          </p>
        </div>
      </div>

      {l.reviewedBy && (
        <p className="mt-2.5 rounded-lg bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-muted sm:text-xs">
          {LEAVE_STATUS_LABELS[l.status]} by{' '}
          <span className="font-medium text-ink">{l.reviewedBy.fullName}</span>
          {l.reviewedAt && `, ${formatDateTime(l.reviewedAt)}`}
          {l.reviewRemarks && ` — “${l.reviewRemarks}”`}
        </p>
      )}

      {canReview && l.status === 'PENDING' && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => onReview('approve')} className="min-w-[6.5rem]">
            <Check className="h-4 w-4" aria-hidden="true" /> Approve
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onReview('reject')}
            className="min-w-[5.5rem]"
          >
            <X className="h-4 w-4 text-red-600" aria-hidden="true" /> Reject
          </Button>
        </div>
      )}
    </li>
  );
}

const TILE_TONES = {
  amber: ['bg-amber-50 ring-amber-200', 'bg-amber-100 text-amber-600', 'text-amber-600'],
  green: ['bg-green-50 ring-green-200', 'bg-green-500 text-white', 'text-green-700'],
  red: ['bg-red-50 ring-red-200', 'bg-red-100 text-red-600', 'text-red-700'],
  blue: ['bg-white ring-blue-200', 'bg-blue-50 text-blue-600', 'text-blue-700'],
} as const;

/** Tinted count tile (Pending / Approved / Rejected / This month). */
export function LeaveStatTile({
  icon: Icon,
  tone,
  value,
  label,
  title,
}: {
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  value: number | string;
  label: string;
  title?: string;
}) {
  const [tile, badge, text] = TILE_TONES[tone];
  return (
    <div className={`min-w-0 rounded-xl p-2 ring-1 sm:p-4 ${tile}`} title={title}>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full sm:h-8 sm:w-8 ${badge}`}
      >
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
      </span>
      <p className={`mt-1.5 text-lg font-bold leading-tight sm:text-3xl ${text}`}>{value}</p>
      <p className="truncate text-[10.5px] text-ink sm:text-sm">{label}</p>
    </div>
  );
}

/** Calendar with a clock between leaves (Staff Leave header). */
export function LeaveIllustration() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="leave-cal-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      {/* leaves */}
      <g fill="#bfdbfe">
        <path d="M14 96c-6-16 0-30 12-34-2 14 0 24-12 34z" />
        <path d="M8 76c2-14 12-20 22-18-6 10-10 16-22 18z" />
        <path d="M106 96c6-16 0-30-12-34 2 14 0 24 12 34z" />
        <path d="M112 76c-2-14-12-20-22-18 6 10 10 16 22 18z" />
      </g>
      <ellipse cx="60" cy="106" rx="44" ry="5" fill="#dbeafe" />
      {/* calendar */}
      <rect x="22" y="24" width="76" height="76" rx="12" fill="#ffffff" />
      <path d="M22 36a12 12 0 0 1 12-12h52a12 12 0 0 1 12 12v8H22z" fill="url(#leave-cal-top)" />
      <rect x="38" y="15" width="7" height="18" rx="3.5" fill="#1e40af" />
      <rect x="75" y="15" width="7" height="18" rx="3.5" fill="#1e40af" />
      <g fill="#dbeafe">
        {[52, 68].map((y) =>
          [30, 46, 62, 78].map((x) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="12" height="10" rx="2.5" />
          )),
        )}
        <rect x="30" y="84" width="12" height="10" rx="2.5" />
        <rect x="46" y="84" width="12" height="10" rx="2.5" />
      </g>
      {/* clock */}
      <circle cx="88" cy="90" r="16" fill="#f0a500" />
      <circle cx="88" cy="90" r="12" fill="#ffffff" />
      <path
        d="M88 82v8h6"
        stroke="#f0a500"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
