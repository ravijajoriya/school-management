import type { SiteContent } from '@school/shared';
import { SITE } from '@/config/site';
import { usePublicPage } from '@/lib/public-api';

/** School details from the CMS, with built-in defaults while loading or if the API is down. */
export function useSite(): SiteContent {
  const { data } = usePublicPage('site');
  return (
    data ?? {
      schoolName: SITE.name,
      tagline: SITE.tagline,
      address: SITE.address,
      phone: SITE.phone,
      email: SITE.email,
      officeHours: SITE.officeHours,
      mapEmbedUrl: '',
      social: { facebook: '', instagram: '', youtube: '' },
      footerText: '',
    }
  );
}
