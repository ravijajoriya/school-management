import type { AuthUser, PermissionCode } from '@school/shared';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';

export function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u-1',
    fullName: 'Asha Verma',
    email: 'asha@test.local',
    phone: null,
    status: 'ACTIVE',
    mustChangePassword: false,
    roles: ['TEACHER'],
    permissions: [],
    ...overrides,
  };
}

/** A fake auth context: no network, fully controllable per test. */
export function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const user = overrides.user === undefined ? null : overrides.user;
  return {
    status: user ? 'authenticated' : 'anonymous',
    user,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn(),
    can: (...perms: PermissionCode[]) => !!user && perms.every((p) => user.permissions.includes(p)),
    hasRole: (role: string) => !!user?.roles.includes(role),
    ...overrides,
  };
}

/**
 * Renders routes inside a memory router with the given auth context.
 * Add marker routes (e.g. `{ path: '/login', element: <p>login page</p> }`) to assert redirects.
 */
export function renderRoutes(
  routes: RouteObject[],
  {
    auth = makeAuth(),
    initialPath = '/',
  }: {
    auth?: AuthContextValue;
    /** A path, or a location with router state (e.g. `{ pathname: '/login', state: {...} }`). */
    initialPath?: string | { pathname: string; state?: unknown };
  } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const result = render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return { ...result, router };
}

export const page = (text: string): ReactElement => <p>{text}</p>;
