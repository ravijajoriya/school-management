import { PERMISSIONS, type PermissionCode } from '@school/shared';
import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { PortalLayout, type PortalNavItem } from '@/layouts/PortalLayout';

const TEACHER_NAV: PortalNavItem[] = [
  { to: '/teacher', label: 'Dashboard', end: true },
  { to: '/teacher/attendance', label: 'Attendance', permissions: [PERMISSIONS.ATTENDANCE_MARK] },
  { to: '/teacher/classes', label: 'My classes' },
  { to: '/teacher/marks', label: 'Marks entry', permissions: [PERMISSIONS.MARKS_ENTER] },
  { to: '/teacher/timetable', label: 'My timetable' },
  { to: '/teacher/leave', label: 'My leave', permissions: [PERMISSIONS.LEAVE_APPLY] },
];

const attendance = () => import('@/features/attendance/pages/TeacherAttendancePages');
const teacherExams = () => import('@/features/exams/pages/TeacherExamPages');

/** A lazily loaded teacher page that also needs a permission. */
function guarded(
  path: string,
  permission: PermissionCode,
  load: () => Promise<{ Component: React.ComponentType }>,
): RouteObject {
  return {
    path,
    element: <RequireAuth permissions={[permission]} />,
    children: [{ index: true, lazy: load }],
  };
}

/**
 * Teacher portal: any signed-in staff member. What a teacher sees inside it is limited on the
 * server to the sections they are class teacher of or have a subject assignment in.
 */
export const teacherRoutes: RouteObject = {
  path: 'teacher',
  element: <RequireAuth />,
  children: [
    {
      element: <PortalLayout title="Teacher Portal" nav={TEACHER_NAV} />,
      children: [
        {
          index: true,
          lazy: async () => ({
            Component: (await import('@/features/teacher/pages/TeacherDashboardPage'))
              .TeacherDashboardPage,
          }),
        },
        {
          path: 'classes',
          lazy: async () => ({
            Component: (await import('@/features/teacher/pages/MyClassesPage')).MyClassesPage,
          }),
        },
        {
          path: 'classes/:sectionId',
          lazy: async () => ({
            Component: (await import('@/features/teacher/pages/MyClassesPage')).ClassRosterPage,
          }),
        },
        guarded('attendance', PERMISSIONS.ATTENDANCE_MARK, async () => ({
          Component: (await attendance()).TeacherAttendancePage,
        })),
        guarded('attendance/:sectionId', PERMISSIONS.ATTENDANCE_MARK, async () => ({
          Component: (await attendance()).TeacherSheetPage,
        })),
        guarded('attendance/:sectionId/register', PERMISSIONS.ATTENDANCE_MARK, async () => ({
          Component: (await attendance()).TeacherRegisterPage,
        })),
        guarded('marks', PERMISSIONS.MARKS_ENTER, async () => ({
          Component: (await teacherExams()).TeacherMarksPage,
        })),
        guarded('marks/:examSubjectId/:sectionId', PERMISSIONS.MARKS_ENTER, async () => ({
          Component: (await teacherExams()).TeacherMarksSheetPage,
        })),
        {
          path: 'timetable',
          lazy: async () => ({ Component: (await teacherExams()).MyTimetablePage }),
        },
        guarded('leave', PERMISSIONS.LEAVE_APPLY, async () => ({
          Component: (await import('@/features/leave/LeavePages')).MyLeavePage,
        })),
      ],
    },
  ],
};
