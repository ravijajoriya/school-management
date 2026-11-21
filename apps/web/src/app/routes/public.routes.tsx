import type { RouteObject } from 'react-router';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { HomePage } from '@/features/public-site/pages/HomePage';
import { PublicLayout } from '@/layouts/PublicLayout';

const phase2 = (title: string) => <PlaceholderPage title={title} phase="Phase 2" />;

/** Public website — no authentication. */
export const publicRoutes: RouteObject = {
  element: <PublicLayout />,
  children: [
    { index: true, element: <HomePage /> },
    { path: 'about', element: phase2('About Us') },
    { path: 'academics', element: phase2('Academics') },
    { path: 'admissions', element: phase2('Admissions') },
    { path: 'facilities', element: phase2('Facilities') },
    { path: 'gallery', element: phase2('Gallery') },
    { path: 'events', element: phase2('Events') },
    { path: 'announcements', element: phase2('Announcements') },
    { path: 'contact', element: phase2('Contact Us') },
  ],
};
