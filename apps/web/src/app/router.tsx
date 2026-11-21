import { createBrowserRouter } from 'react-router';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { NotFoundPage } from '@/features/public-site/pages/NotFoundPage';
import { AuthLayout } from '@/layouts/AuthLayout';
import { adminRoutes } from './routes/admin.routes';
import { publicRoutes } from './routes/public.routes';
import { teacherRoutes } from './routes/teacher.routes';

export const router = createBrowserRouter([
  {
    path: '/',
    children: [
      publicRoutes,
      { element: <AuthLayout />, children: [{ path: 'login', element: <LoginPage /> }] },
      adminRoutes,
      teacherRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
