import type { SiteIcon } from '@school/shared';
import {
  Award,
  BookOpen,
  Building2,
  Bus,
  CalendarDays,
  FlaskConical,
  GraduationCap,
  Heart,
  Leaf,
  Library,
  Monitor,
  Music,
  Palette,
  School,
  ShieldCheck,
  Star,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { SVGProps } from 'react';

/** CMS icon keys (from @school/shared) → SVG icon components. */
const SITE_ICON_COMPONENTS: Record<SiteIcon, LucideIcon> = {
  award: Award,
  'graduation-cap': GraduationCap,
  users: Users,
  building: Building2,
  leaf: Leaf,
  'book-open': BookOpen,
  flask: FlaskConical,
  monitor: Monitor,
  trophy: Trophy,
  bus: Bus,
  library: Library,
  shield: ShieldCheck,
  heart: Heart,
  star: Star,
  calendar: CalendarDays,
  school: School,
  music: Music,
  palette: Palette,
};

export function SiteIconView({ icon, className }: { icon: SiteIcon; className?: string }) {
  const Icon = SITE_ICON_COMPONENTS[icon] ?? Star;
  return <Icon className={className} aria-hidden="true" />;
}

// Simple brand marks (lucide no longer ships brand logos).
type IconProps = SVGProps<SVGSVGElement>;

export const FacebookIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M14 8.5V6.8c0-.8.5-1 .9-1H17V2.1L14.1 2C11 2 10.3 4.3 10.3 5.8v2.7H8v3.8h2.3V22H14v-9.7h2.8l.4-3.8H14Z" />
  </svg>
);

export const InstagramIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
  </svg>
);

export const YoutubeIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
  </svg>
);
