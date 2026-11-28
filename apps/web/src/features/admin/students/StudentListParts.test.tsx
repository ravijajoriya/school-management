import type { StudentListItem } from '@school/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeAuth, makeUser, renderRoutes } from '@/test/render';
import { StudentCard } from './StudentListParts';

const student = (over: Partial<StudentListItem> = {}): StudentListItem => ({
  id: 'st1',
  admissionNumber: 'DEMO-0048',
  firstName: 'Aarav',
  middleName: null,
  lastName: 'Rathore',
  fullName: 'Aarav Rathore',
  dateOfBirth: '2010-05-14',
  gender: 'MALE',
  status: 'ACTIVE',
  primaryGuardian: { fullName: 'Deepak Rathore', relationship: 'FATHER', phone: '9800380112' },
  enrolment: {
    id: 'e1',
    academicYear: { id: 'y1', name: '2026-2027' },
    classId: 'c12',
    className: 'Class 12',
    sectionId: 's1',
    sectionName: 'A',
    rollNumber: '1',
    status: 'ACTIVE',
  },
  admissionDate: '2026-04-01',
  pendingFees: 20800,
  ...over,
});

const render = (s: StudentListItem, permissions: string[] = []) =>
  renderRoutes([{ path: '/', element: <StudentCard student={s} /> }], {
    initialPath: '/',
    auth: makeAuth({ user: makeUser({ permissions: permissions as never }) }),
  });

describe('StudentCard', () => {
  it('shows initials, name, class, parent with a call link and pending fees', () => {
    render(student());
    expect(screen.getByText('AR')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aarav Rathore' })).toHaveAttribute(
      'href',
      '/admin/students/st1',
    );
    expect(screen.getByText('Class 12 – A')).toBeInTheDocument();
    expect(screen.getByText('Deepak Rathore')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /9800380112/ })).toHaveAttribute(
      'href',
      'tel:9800380112',
    );
    expect(screen.getByText('₹20,800')).toBeInTheDocument();
  });

  it('shows Nil when nothing is due, and nothing without fee access', () => {
    const { unmount } = render(student({ pendingFees: 0 }));
    expect(screen.getByText('Nil')).toBeInTheDocument();
    unmount();
    render(student({ pendingFees: null }));
    expect(screen.queryByText('Nil')).not.toBeInTheDocument();
  });

  it('opens the ⋮ menu with the actions the user may take', async () => {
    render(student(), ['fees.read', 'fees.collect']);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Aarav Rathore' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /View student/ })).toHaveAttribute(
      'href',
      '/admin/students/st1',
    );
    expect(within(menu).getByRole('menuitem', { name: /Fee ledger/ })).toHaveAttribute(
      'href',
      '/admin/fees/students/st1',
    );
    expect(within(menu).getByRole('menuitem', { name: /Collect fees/ })).toHaveAttribute(
      'href',
      '/admin/fees/collect?studentId=st1',
    );
    expect(within(menu).getByRole('menuitem', { name: /Call parent/ })).toHaveAttribute(
      'href',
      'tel:9800380112',
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
