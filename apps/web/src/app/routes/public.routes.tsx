import type { RouteObject } from 'react-router';
import { HomePage } from '@/features/public-site/pages/HomePage';
import { PublicLayout } from '@/layouts/PublicLayout';

const info = () => import('@/features/public-site/pages/InfoPages');
const forms = () => import('@/features/public-site/pages/FormPages');
const listings = () => import('@/features/public-site/pages/ListingPages');

/** Public website — no authentication. Inner pages are lazy-loaded; the home page is not. */
export const publicRoutes: RouteObject = {
  element: <PublicLayout />,
  children: [
    { index: true, element: <HomePage /> },
    { path: 'about', lazy: async () => ({ Component: (await info()).AboutPage }) },
    { path: 'academics', lazy: async () => ({ Component: (await info()).AcademicsPage }) },
    { path: 'facilities', lazy: async () => ({ Component: (await info()).FacilitiesPage }) },
    { path: 'admissions', lazy: async () => ({ Component: (await forms()).AdmissionsPage }) },
    { path: 'contact', lazy: async () => ({ Component: (await forms()).ContactPage }) },
    { path: 'gallery', lazy: async () => ({ Component: (await listings()).GalleryPage }) },
    { path: 'events', lazy: async () => ({ Component: (await listings()).EventsPage }) },
    { path: 'events/:slug', lazy: async () => ({ Component: (await listings()).EventDetailPage }) },
    {
      path: 'announcements',
      lazy: async () => ({ Component: (await listings()).AnnouncementsPage }),
    },
    {
      path: 'announcements/:slug',
      lazy: async () => ({ Component: (await listings()).AnnouncementDetailPage }),
    },
  ],
};
