import type { RouteObject } from 'react-router';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { PortalLayout, type PortalNavItem } from '@/layouts/PortalLayout';

const TEACHER_NAV: PortalNavItem[] = [{ to: '/teacher', label: 'Dashboard', end: true }];

/** Teacher portal — will be wrapped by an auth guard in the auth step. */
export const teacherRoutes: RouteObject = {
  path: 'teacher',
  element: <PortalLayout title="Teacher Portal" nav={TEACHER_NAV} />,
  children: [{ index: true, element: <PlaceholderPage title="Dashboard" phase="Phase 1" /> }],
};
