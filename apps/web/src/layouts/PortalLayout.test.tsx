import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeAuth, makeUser, page, renderRoutes } from '@/test/render';
import { PortalLayout, type PortalNavItem } from './PortalLayout';

const NAV: PortalNavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/users', label: 'Users', permissions: ['users.read'] },
  { to: '/admin/audit-logs', label: 'Audit Logs', permissions: ['audit_logs.read'] },
];

const routes = [
  {
    path: '/admin',
    element: <PortalLayout title="Admin Portal" nav={NAV} />,
    children: [{ index: true, element: page('dashboard') }],
  },
  { path: '/login', element: page('login page') },
  { path: '/change-password', element: page('change password page') },
];

describe('PortalLayout', () => {
  it('only shows navigation the user is allowed to use', () => {
    renderRoutes(routes, {
      auth: makeAuth({ user: makeUser({ permissions: ['users.read'] }) }),
      initialPath: '/admin',
    });
    const nav = screen.getByRole('navigation', { name: 'Admin Portal navigation' });
    expect(nav).toHaveTextContent('Dashboard');
    expect(nav).toHaveTextContent('Users');
    expect(nav).not.toHaveTextContent('Audit Logs');
  });

  it('shows the signed-in user and signs out from the user menu', async () => {
    const auth = makeAuth({ user: makeUser({ fullName: 'Asha Verma', roles: ['TEACHER'] }) });
    renderRoutes(routes, { auth, initialPath: '/admin' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Asha Verma/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(auth.logout).toHaveBeenCalled();
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('opens the change password page from the user menu', async () => {
    renderRoutes(routes, { auth: makeAuth({ user: makeUser() }), initialPath: '/admin' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Asha Verma/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Change password' }));
    expect(await screen.findByText('change password page')).toBeInTheDocument();
  });
});
