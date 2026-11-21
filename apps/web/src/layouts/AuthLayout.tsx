import { Outlet } from 'react-router';

/** Centered card layout for login / password change screens. */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <Outlet />
      </div>
    </div>
  );
}
