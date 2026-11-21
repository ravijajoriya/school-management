import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { PortalLayout, type PortalNavItem } from '@/layouts/PortalLayout';

const TEACHER_NAV: PortalNavItem[] = [{ to: '/teacher', label: 'Dashboard', end: true }];

/** Teacher portal — any signed-in staff member. Class-level access arrives with Phase 3. */
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
      ],
    },
  ],
};
