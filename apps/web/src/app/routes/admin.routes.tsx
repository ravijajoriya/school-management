import type { RouteObject } from 'react-router';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { PortalLayout, type PortalNavItem } from '@/layouts/PortalLayout';

const ADMIN_NAV: PortalNavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/roles', label: 'Roles & Permissions' },
  { to: '/admin/audit-logs', label: 'Audit Logs' },
];

/** Admin portal — will be wrapped by an auth + permission guard in the auth step. */
export const adminRoutes: RouteObject = {
  path: 'admin',
  element: <PortalLayout title="Admin Portal" nav={ADMIN_NAV} />,
  children: [
    { index: true, element: <PlaceholderPage title="Dashboard" phase="Phase 1" /> },
    { path: 'users', element: <PlaceholderPage title="Users" phase="Phase 1" /> },
    { path: 'roles', element: <PlaceholderPage title="Roles & Permissions" phase="Phase 1" /> },
    { path: 'audit-logs', element: <PlaceholderPage title="Audit Logs" phase="Phase 1" /> },
  ],
};
