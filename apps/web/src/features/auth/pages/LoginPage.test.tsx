import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { makeAuth, makeUser, page, renderRoutes } from '@/test/render';
import { LoginPage } from './LoginPage';

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/admin', element: page('admin home') },
  { path: '/teacher', element: page('teacher home') },
  { path: '/change-password', element: page('change password page') },
  { path: '/admin/users', element: page('users page') },
];

function apiError(status: number, message: string) {
  const headers = new AxiosHeaders();
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', { headers }, null, {
    status,
    statusText: '',
    headers: {},
    config: { headers },
    data: { statusCode: status, error: 'Error', message, path: '/auth/login', timestamp: '' },
  });
}

async function fillAndSubmit(identifier: string, password: string) {
  const user = userEvent.setup();
  if (identifier) await user.type(screen.getByLabelText('Email or phone number'), identifier);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('validates the form before calling the API', async () => {
    const login = vi.fn();
    renderRoutes(routes, { auth: makeAuth({ login }), initialPath: '/login' });
    await fillAndSubmit('', '');
    expect(await screen.findByText('Enter your email or phone number')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('sends admins to the admin portal', async () => {
    const login = vi
      .fn()
      .mockResolvedValue(makeUser({ roles: ['ADMIN'], permissions: ['users.read'] }));
    renderRoutes(routes, { auth: makeAuth({ login }), initialPath: '/login' });
    await fillAndSubmit('admin@test.local', 'Secret-Pass-1');
    expect(login).toHaveBeenCalledWith({
      identifier: 'admin@test.local',
      password: 'Secret-Pass-1',
    });
    expect(await screen.findByText('admin home')).toBeInTheDocument();
  });

  it('sends teachers to the teacher portal', async () => {
    const login = vi.fn().mockResolvedValue(makeUser());
    renderRoutes(routes, { auth: makeAuth({ login }), initialPath: '/login' });
    await fillAndSubmit('9876543210', 'Secret-Pass-1');
    expect(await screen.findByText('teacher home')).toBeInTheDocument();
  });

  it('sends users with a temporary password to change it first', async () => {
    const login = vi.fn().mockResolvedValue(makeUser({ mustChangePassword: true }));
    renderRoutes(routes, { auth: makeAuth({ login }), initialPath: '/login' });
    await fillAndSubmit('asha@test.local', 'Temp-Pass-1');
    expect(await screen.findByText('change password page')).toBeInTheDocument();
  });

  it('returns to the page the user originally asked for', async () => {
    const login = vi
      .fn()
      .mockResolvedValue(makeUser({ roles: ['ADMIN'], permissions: ['users.read'] }));
    renderRoutes(routes, {
      auth: makeAuth({ login }),
      initialPath: { pathname: '/login', state: { from: '/admin/users' } },
    });
    await fillAndSubmit('admin@test.local', 'Secret-Pass-1');
    expect(await screen.findByText('users page')).toBeInTheDocument();
  });

  it('shows the server message for wrong credentials', async () => {
    const login = vi.fn().mockRejectedValue(apiError(401, 'Invalid email/phone or password'));
    renderRoutes(routes, { auth: makeAuth({ login }), initialPath: '/login' });
    await fillAndSubmit('admin@test.local', 'wrong-pass-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email/phone or password');
  });

  it('explains rate limiting in plain words', async () => {
    const login = vi.fn().mockRejectedValue(apiError(429, 'ThrottlerException: Too Many Requests'));
    renderRoutes(routes, { auth: makeAuth({ login }), initialPath: '/login' });
    await fillAndSubmit('admin@test.local', 'wrong-pass-1');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Too many login attempts'),
    );
  });

  it('skips the form when already signed in', async () => {
    renderRoutes(routes, { auth: makeAuth({ user: makeUser() }), initialPath: '/login' });
    expect(await screen.findByText('teacher home')).toBeInTheDocument();
  });
});
