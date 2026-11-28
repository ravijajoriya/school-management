import type { EmployeeListItem } from '@school/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoutes } from '@/test/render';
import { StaffCard } from './StaffListParts';

const employee = (over: Partial<EmployeeListItem> = {}): EmployeeListItem => ({
  id: 'e1',
  employeeCode: 'DEMO-EMP-05',
  firstName: 'Anil',
  lastName: 'Meena',
  fullName: 'Anil Meena',
  designation: 'TGT Mathematics',
  department: 'Mathematics',
  email: 'anil@demo.local',
  phone: '9829010685',
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  user: null,
  roles: [],
  licenceNumber: null,
  licenceExpiry: null,
  onLeave: null,
  ...over,
});

const render = (e: EmployeeListItem) =>
  renderRoutes([{ path: '/', element: <StaffCard employee={e} /> }], { initialPath: '/' });

describe('StaffCard', () => {
  it('shows initials, name, code, designation, phone and Active', () => {
    render(employee());
    expect(screen.getByText('AM')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anil Meena' })).toHaveAttribute(
      'href',
      '/admin/staff/e1',
    );
    expect(screen.getByText('DEMO-EMP-05')).toBeInTheDocument();
    expect(screen.getByText('TGT Mathematics')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /9829010685/ })).toHaveAttribute(
      'href',
      'tel:9829010685',
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows On Leave (with the leave in the tooltip) for staff on leave today', () => {
    render(
      employee({ onLeave: { leaveType: 'SICK', startDate: '2026-11-27', endDate: '2026-11-29' } }),
    );
    const pill = screen.getByText('On Leave');
    expect(pill.closest('[title]')).toHaveAttribute('title', expect.stringMatching(/until/));
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('offers view, call and email in the ⋮ menu', async () => {
    render(employee());
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Anil Meena' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /View staff/ })).toHaveAttribute(
      'href',
      '/admin/staff/e1',
    );
    expect(within(menu).getByRole('menuitem', { name: /Call/ })).toHaveAttribute(
      'href',
      'tel:9829010685',
    );
    expect(within(menu).getByRole('menuitem', { name: /Email/ })).toHaveAttribute(
      'href',
      'mailto:anil@demo.local',
    );
  });
});
