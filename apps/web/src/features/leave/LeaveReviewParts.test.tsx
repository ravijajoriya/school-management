import type { LeaveRequestItem } from '@school/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { shortLeaveDates } from './format';
import { LeaveCard } from './LeaveReviewParts';

const leave = (over: Partial<LeaveRequestItem> = {}): LeaveRequestItem => ({
  id: 'l1',
  employee: {
    id: 'e1',
    fullName: 'Anil Meena',
    employeeCode: 'DEMO-EMP-05',
    designation: 'TGT Mathematics',
  },
  leaveType: 'EARNED',
  startDate: '2026-12-09',
  endDate: '2026-12-13',
  days: 5,
  reason: 'Family trip to Udaipur during the break',
  status: 'PENDING',
  reviewedBy: null,
  reviewedAt: null,
  reviewRemarks: null,
  createdAt: '2026-11-20T05:00:00.000Z',
  canCancel: true,
  ...over,
});

const render = (l: LeaveRequestItem, canReview = true, onReview = vi.fn()) =>
  renderRoutes(
    [
      {
        path: '/',
        element: (
          <ul>
            <LeaveCard leave={l} canReview={canReview} onReview={onReview} />
          </ul>
        ),
      },
    ],
    { initialPath: '/' },
  );

describe('shortLeaveDates', () => {
  it('shortens ranges within a month or year and keeps full dates across years', () => {
    expect(shortLeaveDates({ startDate: '2026-12-09', endDate: '2026-12-13' })).toBe(
      '9 – 13 Dec 2026',
    );
    expect(shortLeaveDates({ startDate: '2026-11-30', endDate: '2026-12-01' })).toBe(
      '30 Nov – 1 Dec 2026',
    );
    expect(shortLeaveDates({ startDate: '2026-12-30', endDate: '2027-01-02' })).toBe(
      '30 Dec 2026 – 2 Jan 2027',
    );
    expect(shortLeaveDates({ startDate: '2026-12-09', endDate: '2026-12-09' })).toBe('9 Dec 2026');
  });
});

describe('LeaveCard', () => {
  it('shows the staff member, type, dates, days, reason and Pending, with Approve / Reject', async () => {
    const onReview = vi.fn();
    render(leave(), true, onReview);
    expect(screen.getByRole('link', { name: 'Anil Meena' })).toHaveAttribute(
      'href',
      '/admin/staff/e1',
    );
    expect(screen.getByText('DEMO-EMP-05 · TGT Mathematics')).toBeInTheDocument();
    expect(screen.getByText('Earned leave')).toBeInTheDocument();
    expect(screen.getByText('9 – 13 Dec 2026')).toBeInTheDocument();
    expect(screen.getByText('5 days')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReview.mock.calls).toEqual([['approve'], ['reject']]);
  });

  it('hides the buttons without approval rights and for reviewed requests, showing the review', () => {
    const { unmount } = render(leave(), false);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    unmount();
    render(
      leave({
        status: 'REJECTED',
        reviewedBy: { id: 'u1', fullName: 'School Administrator' },
        reviewedAt: '2026-11-21T05:00:00.000Z',
        reviewRemarks: 'Exams that week',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent(
      /Rejected by School Administrator.*Exams that week/,
    );
  });
});
