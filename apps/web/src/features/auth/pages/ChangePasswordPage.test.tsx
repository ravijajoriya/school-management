import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { makeAuth, makeUser, page, renderRoutes } from '@/test/render';
import { ChangePasswordPage } from './ChangePasswordPage';

const routes = [
  { path: '/change-password', element: <ChangePasswordPage /> },
  { path: '/teacher', element: page('teacher home') },
  { path: '/login', element: page('login page') },
];

async function submit(current: string, next: string, confirm: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Current password'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Update password' }));
}

describe('ChangePasswordPage', () => {
  const pendingUser = makeUser({ mustChangePassword: true });

  it('greets users who must change a temporary password', () => {
    renderRoutes(routes, {
      auth: makeAuth({ user: pendingUser }),
      initialPath: '/change-password',
    });
    expect(screen.getByText(/choose a new password before continuing/)).toBeInTheDocument();
  });

  it('enforces the password policy and matching confirmation', async () => {
    const changePassword = vi.fn();
    renderRoutes(routes, {
      auth: makeAuth({ user: pendingUser, changePassword }),
      initialPath: '/change-password',
    });
    await submit('Temp-Pass-1', 'short', 'different');
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('changes the password and continues to the dashboard', async () => {
    const changePassword = vi.fn().mockResolvedValue(makeUser());
    renderRoutes(routes, {
      auth: makeAuth({ user: pendingUser, changePassword }),
      initialPath: '/change-password',
    });
    await submit('Temp-Pass-1', 'Brand-New-2', 'Brand-New-2');
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'Temp-Pass-1',
      newPassword: 'Brand-New-2',
    });
    expect(await screen.findByText('teacher home')).toBeInTheDocument();
  });

  it('shows a wrong current password next to the field', async () => {
    const headers = new AxiosHeaders();
    const error = new AxiosError('Bad Request', 'ERR_BAD_REQUEST', { headers }, null, {
      status: 400,
      statusText: '',
      headers: {},
      config: { headers },
      data: { message: ['currentPassword: Current password is incorrect'] },
    });
    renderRoutes(routes, {
      auth: makeAuth({ user: pendingUser, changePassword: vi.fn().mockRejectedValue(error) }),
      initialPath: '/change-password',
    });
    await submit('nope-1234', 'Brand-New-2', 'Brand-New-2');
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
  });

  it('redirects to login when signed out', () => {
    renderRoutes(routes, { initialPath: '/change-password' });
    expect(screen.getByText('login page')).toBeInTheDocument();
  });
});
