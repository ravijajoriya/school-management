import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeAuth, makeUser, page, renderRoutes } from '@/test/render';
import { RequireAuth } from './RequireAuth';

const routes = (guard: React.ReactElement) => [
  { path: '/login', element: page('login page') },
  { path: '/change-password', element: page('change password page') },
  { path: '/secret', element: guard, children: [{ index: true, element: page('secret content') }] },
];

describe('RequireAuth', () => {
  it('shows a spinner while the session is being restored', () => {
    renderRoutes(routes(<RequireAuth />), {
      auth: makeAuth({ status: 'loading' }),
      initialPath: '/secret',
    });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('sends anonymous visitors to the login page and remembers where they were going', () => {
    const { router } = renderRoutes(routes(<RequireAuth />), { initialPath: '/secret?tab=1' });
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ from: '/secret?tab=1' });
  });

  it('forces a password change before anything else', () => {
    renderRoutes(routes(<RequireAuth />), {
      auth: makeAuth({ user: makeUser({ mustChangePassword: true }) }),
      initialPath: '/secret',
    });
    expect(screen.getByText('change password page')).toBeInTheDocument();
  });

  it('shows "no access" when a required permission is missing', () => {
    renderRoutes(routes(<RequireAuth permissions={['users.read']} />), {
      auth: makeAuth({ user: makeUser() }),
      initialPath: '/secret',
    });
    expect(screen.getByText('You don’t have access to this page')).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it.each([
    ['no permissions', []],
    ['only self-service permissions', ['attendance.mark_assigned', 'leave.apply']],
  ] as const)('keeps teachers with %s out of the admin area', (_label, permissions) => {
    renderRoutes(routes(<RequireAuth adminArea />), {
      auth: makeAuth({ user: makeUser({ roles: ['TEACHER'], permissions: [...permissions] }) }),
      initialPath: '/secret',
    });
    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute(
      'href',
      '/teacher',
    );
  });

  it('lets office staff with an administrative permission into the admin area', () => {
    renderRoutes(routes(<RequireAuth adminArea />), {
      auth: makeAuth({ user: makeUser({ roles: ['OFFICE'], permissions: ['attendance.read'] }) }),
      initialPath: '/secret',
    });
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });

  it('renders the page when the user has every required permission', () => {
    renderRoutes(routes(<RequireAuth permissions={['users.read']} adminArea />), {
      auth: makeAuth({ user: makeUser({ roles: ['ADMIN'], permissions: ['users.read'] }) }),
      initialPath: '/secret',
    });
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });
});
