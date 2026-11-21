import { PERMISSIONS } from '@school/shared';
import type { RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { PortalLayout, type PortalNavItem } from '@/layouts/PortalLayout';

const ADMIN_NAV: PortalNavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users', permissions: [PERMISSIONS.USERS_READ] },
  { to: '/admin/roles', label: 'Roles & Permissions', permissions: [PERMISSIONS.ROLES_READ] },
  { to: '/admin/audit-logs', label: 'Audit Logs', permissions: [PERMISSIONS.AUDIT_LOGS_READ] },
];

/**
 * Admin portal. Pages are lazy-loaded so public-website visitors never download portal code.
 * Every page re-checks its permission here; the API enforces the same rules independently.
 */
export const adminRoutes: RouteObject = {
  path: 'admin',
  element: <RequireAuth adminArea />,
  children: [
    {
      element: <PortalLayout title="Admin Portal" nav={ADMIN_NAV} />,
      children: [
        {
          index: true,
          lazy: async () => ({
            Component: (await import('@/features/admin/pages/AdminDashboardPage'))
              .AdminDashboardPage,
          }),
        },
        {
          path: 'users',
          element: <RequireAuth permissions={[PERMISSIONS.USERS_READ]} />,
          children: [
            {
              index: true,
              lazy: async () => ({
                Component: (await import('@/features/admin/pages/UsersPage')).UsersPage,
              }),
            },
          ],
        },
        {
          path: 'roles',
          element: <RequireAuth permissions={[PERMISSIONS.ROLES_READ]} />,
          children: [
            {
              index: true,
              lazy: async () => ({
                Component: (await import('@/features/admin/pages/RolesPage')).RolesPage,
              }),
            },
          ],
        },
        {
          path: 'audit-logs',
          element: <RequireAuth permissions={[PERMISSIONS.AUDIT_LOGS_READ]} />,
          children: [
            {
              index: true,
              lazy: async () => ({
                Component: (await import('@/features/admin/pages/AuditLogsPage')).AuditLogsPage,
              }),
            },
          ],
        },
      ],
    },
  ],
};
