import { Clock, Mail, MapPin, Menu, Phone, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { FacebookIcon, InstagramIcon, YoutubeIcon } from '@/components/common/icons';
import { SchoolLogo } from '@/components/common/SchoolLogo';
import { PUBLIC_NAV } from '@/config/site';
import { useSite } from '@/features/public-site/components/use-site';

const CURRENT_YEAR = new Date().getFullYear();

function SocialLinks({ className = 'h-4 w-4' }: { className?: string }) {
  const { social } = useSite();
  const links = [
    { href: social.facebook, label: 'Facebook', Icon: FacebookIcon },
    { href: social.instagram, label: 'Instagram', Icon: InstagramIcon },
    { href: social.youtube, label: 'YouTube', Icon: YoutubeIcon },
  ].filter((l) => l.href);
  if (!links.length) return null;
  return (
    <div className="flex items-center gap-2">
      {links.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-brand-gold hover:text-brand-navy-dark"
        >
          <Icon className={className} />
        </a>
      ))}
    </div>
  );
}

/** Public website shell: navy top bar, sticky header with nav (mobile menu), footer. */
export function PublicLayout() {
  const site = useSite();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 py-1 transition-colors ${
      isActive
        ? 'border-brand-gold text-brand-navy'
        : 'border-transparent text-ink hover:text-brand-navy'
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Scroll to top on page change; restore position on back/forward. */}
      <ScrollRestoration />
      <div className="hidden bg-brand-navy text-xs text-white md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-brand-gold" aria-hidden="true" />
            {site.address}
          </span>
          <div className="flex items-center gap-6">
            <a
              href={`tel:${site.phone.replace(/\s/g, '')}`}
              className="flex items-center gap-1.5 hover:text-brand-gold"
            >
              <Phone className="h-3.5 w-3.5 text-brand-gold" aria-hidden="true" />
              {site.phone}
            </a>
            {site.email && (
              <a
                href={`mailto:${site.email}`}
                className="flex items-center gap-1.5 hover:text-brand-gold"
              >
                <Mail className="h-3.5 w-3.5 text-brand-gold" aria-hidden="true" />
                {site.email}
              </a>
            )}
            <SocialLinks className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <SchoolLogo className="h-11 w-11 shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-lg font-bold text-brand-navy md:text-xl">
                {site.schoolName}
              </div>
              <div className="truncate text-xs text-ink-muted">{site.tagline}</div>
            </div>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium xl:flex">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : undefined}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            className="rounded-md p-2 text-brand-navy hover:bg-gray-100 xl:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {menuOpen && (
          <nav
            id="mobile-menu"
            aria-label="Main"
            className="border-t border-gray-100 bg-white xl:hidden"
          >
            <ul className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
              {PUBLIC_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={'end' in item ? item.end : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `block rounded-md px-3 py-2.5 text-sm font-medium ${
                        isActive
                          ? 'bg-brand-gold-light text-brand-navy'
                          : 'text-ink hover:bg-gray-50'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-brand-navy-dark text-sm text-white/80">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-3">
              <SchoolLogo className="h-10 w-10" onDark />
              <span className="text-lg font-semibold text-white">{site.schoolName}</span>
            </div>
            {site.footerText && <p className="mt-4 leading-relaxed">{site.footerText}</p>}
            <div className="mt-4">
              <SocialLinks />
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-white">Quick links</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {PUBLIC_NAV.filter((n) => n.to !== '/').map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="hover:text-brand-gold">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold text-white">Contact</h2>
            <ul className="mt-3 space-y-2">
              <li className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden="true" />
                {site.address}
              </li>
              <li className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden="true" />
                <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="hover:text-brand-gold">
                  {site.phone}
                </a>
              </li>
              {site.email && (
                <li className="flex gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden="true" />
                  <a href={`mailto:${site.email}`} className="hover:text-brand-gold">
                    {site.email}
                  </a>
                </li>
              )}
              {site.officeHours && (
                <li className="flex gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden="true" />
                  {site.officeHours}
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs sm:px-6">
            <span>
              © {CURRENT_YEAR} {site.schoolName}. All rights reserved.
            </span>
            <Link to="/login" className="hover:text-brand-gold">
              Staff Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
