import { createBrowserRouter } from 'react-router';
import { PageSpinner } from '@/components/ui';
import { NotFoundPage } from '@/features/public-site/pages/NotFoundPage';
import { AuthLayout } from '@/layouts/AuthLayout';
import { adminRoutes } from './routes/admin.routes';
import { publicRoutes } from './routes/public.routes';
import { teacherRoutes } from './routes/teacher.routes';

export const router = createBrowserRouter([
  {
    path: '/',
    // Shown while a lazy-loaded page is fetched on the first visit.
    hydrateFallbackElement: <PageSpinner />,
    children: [
      publicRoutes,
      {
        element: <AuthLayout />,
        children: [
          {
            path: 'login',
            lazy: async () => ({
              Component: (await import('@/features/auth/pages/LoginPage')).LoginPage,
            }),
          },
          {
            path: 'change-password',
            lazy: async () => ({
              Component: (await import('@/features/auth/pages/ChangePasswordPage'))
                .ChangePasswordPage,
            }),
          },
        ],
      },
      adminRoutes,
      teacherRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
