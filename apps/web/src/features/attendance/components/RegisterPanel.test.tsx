import type { SectionRegister } from '@school/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { RegisterPanel } from './AttendanceReports';

const register: SectionRegister = {
  section: {
    id: 's1',
    className: 'Class 5',
    sectionName: 'A',
    academicYear: { id: 'y1', name: '2026-2027' },
  },
  month: '2026-11',
  days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'],
  workingDays: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'],
  rows: [
    {
      enrolmentId: 'e1',
      studentId: 'st1',
      rollNumber: '1',
      fullName: 'Aarav Mathur',
      days: {
        '2026-11-02': 'PRESENT',
        '2026-11-03': 'LATE',
        '2026-11-04': 'PRESENT',
        '2026-11-05': 'PRESENT',
      },
      present: 3,
      absent: 0,
      late: 1,
      marked: 4,
      percentage: 100,
    },
    {
      enrolmentId: 'e2',
      studentId: 'st2',
      rollNumber: '2',
      fullName: 'Dev Soni',
      days: {
        '2026-11-02': 'ABSENT',
        '2026-11-03': 'ABSENT',
        '2026-11-04': 'PRESENT',
        '2026-11-05': 'LATE',
      },
      present: 1,
      absent: 2,
      late: 1,
      marked: 4,
      percentage: 50,
    },
  ],
};

vi.mock('../attendance-api', () => ({
  useSectionRegister: () => ({ isLoading: false, isError: false, data: register }),
  useStudentAttendance: () => ({ isLoading: true }),
}));

const renderPanel = () =>
  renderRoutes(
    [
      {
        path: '/',
        element: (
          <RegisterPanel
            sectionId="s1"
            month="2026-11"
            studentHref={(id) => `/admin/students/${id}`}
          />
        ),
      },
    ],
    { initialPath: '/' },
  );

describe('RegisterPanel', () => {
  it('shows the summary and each day as a P / A / L tile', () => {
    renderPanel();
    expect(
      screen.getByRole('heading', { name: 'Class 5 – A · November 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Days')).toBeInTheDocument();
    const dev = screen.getByRole('row', { name: 'Dev Soni' });
    expect(within(dev).getAllByText('A')).toHaveLength(2);
    expect(within(dev).getByText('L')).toBeInTheDocument();
  });

  it('filters to students below 75% and back', async () => {
    renderPanel();
    const bar = screen.getByRole('button', { name: /1 student\(s\) below 75% attendance/ });
    await userEvent.click(bar);
    expect(bar).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('row', { name: 'Aarav Mathur' })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Dev Soni' })).toBeInTheDocument();
    await userEvent.click(bar);
    expect(screen.getByRole('row', { name: 'Aarav Mathur' })).toBeInTheDocument();
  });

  it('ends each row with the attendance % (first names on phones), which opens the month summary', async () => {
    renderPanel();
    const dev = screen.getByRole('row', { name: 'Dev Soni' });
    expect(within(dev).getByText('Dev')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Dev Soni: 50% attendance, month summary' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Dev Soni' });
    expect(sheet).toHaveTextContent('Roll 2 · Class 5 – A · November 2026');
    expect(sheet).toHaveTextContent('Attendance50%');
    expect(sheet).toHaveTextContent('Absent on2 Nov, 3 Nov');
    expect(sheet).toHaveTextContent('Late on5 Nov');
    expect(within(sheet).getByRole('link', { name: /Open student record/ })).toHaveAttribute(
      'href',
      '/admin/students/st2',
    );
  });
});
