import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { PortalLayout, type PortalNavItem } from '@/layouts/PortalLayout';

const TEACHER_NAV: PortalNavItem[] = [
  { to: '/teacher', label: 'Dashboard', end: true },
  { to: '/teacher/classes', label: 'My classes' },
];

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
      ],
    },
  ],
};
