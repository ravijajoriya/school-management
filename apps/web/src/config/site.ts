/**
 * School identity shown in the public layout.
 * TEMPORARY: values copied from the design mock-up and must be confirmed by the school.
 * In Phase 2 these move into CMS-managed settings.
 */
export const SITE = {
  name: 'Rajasthan Public School',
  tagline: 'RBSE Affiliated | Nursery to 12th',
  address: 'School Road, Civil Lines, Jaipur, Rajasthan - 302001',
  phone: '+91 98765 43210',
  email: 'info@rajasthanpublicschool.in',
  officeHours: 'Monday – Saturday, 8:00 AM – 4:00 PM',
} as const;

export const PUBLIC_NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/academics', label: 'Academics' },
  { to: '/admissions', label: 'Admissions' },
  { to: '/facilities', label: 'Facilities' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/events', label: 'Events' },
  { to: '/announcements', label: 'Announcements' },
  { to: '/contact', label: 'Contact' },
] as const;
