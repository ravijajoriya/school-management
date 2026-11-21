import type { PermissionCode } from '@school/shared';
import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { PageSpinner } from '@/components/ui';
import { homePathFor, useAuth } from './auth-context';

/**
 * Route guard. The API enforces every rule independently; this only decides what to render.
 *  - not signed in        → /login (and come back afterwards)
 *  - must change password → /change-password
 *  - missing permission   → "no access" message
 */
export function RequireAuth({
  permissions = [],
  adminArea = false,
  children,
}: {
  permissions?: PermissionCode[];
  /** Admin portal shell: requires the ADMIN role or at least one administrative permission. */
  adminArea?: boolean;
  children?: ReactNode;
}) {
  const { status, user, can } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageSpinner />;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (adminArea && homePathFor(user) !== '/admin') return <NoAccess homePath={homePathFor(user)} />;
  if (permissions.length && !can(...permissions)) return <NoAccess homePath={homePathFor(user)} />;
  return children ?? <Outlet />;
}

/** Shows children only when the user holds all the given permissions (hides buttons/links). */
export function PermissionGate({
  permissions,
  children,
}: {
  permissions: PermissionCode[];
  children: ReactNode;
}) {
  const { can } = useAuth();
  return can(...permissions) ? children : null;
}

function NoAccess({ homePath }: { homePath: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm font-semibold text-brand-gold">403</p>
      <h1 className="mt-2 text-2xl font-bold text-brand-navy">
        You don’t have access to this page
      </h1>
      <p className="mt-2 text-sm text-ink-muted">Ask the school administrator if you need it.</p>
      <Link
        to={homePath}
        className="mt-6 inline-block text-sm font-semibold text-brand-navy underline"
      >
        Go to your dashboard
      </Link>
    </div>
  );
}
