import { NavLink, Outlet } from 'react-router';
import { SchoolLogo } from '@/components/common/SchoolLogo';
import { PUBLIC_NAV, SITE } from '@/config/site';

const CURRENT_YEAR = new Date().getFullYear();

/** Public website shell: navy top bar, white header with nav (gold active underline), footer. */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-brand-navy text-xs text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2">
          <span>{SITE.address}</span>
          <div className="flex items-center gap-6">
            <a href={`tel:${SITE.phone.replace(/\s/g, '')}`} className="hover:text-brand-gold">
              {SITE.phone}
            </a>
            <a href={`mailto:${SITE.email}`} className="hover:text-brand-gold">
              {SITE.email}
            </a>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3">
          <NavLink to="/" className="flex items-center gap-3">
            <SchoolLogo />
            <div className="leading-tight">
              <div className="text-xl font-bold text-brand-navy">{SITE.name}</div>
              <div className="text-xs text-ink-muted">{SITE.tagline}</div>
            </div>
          </NavLink>
          <nav aria-label="Main" className="flex items-center gap-6 text-sm font-medium">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : undefined}
                className={({ isActive }) =>
                  `border-b-2 py-1 transition-colors ${
                    isActive
                      ? 'border-brand-gold text-brand-navy'
                      : 'border-transparent text-ink hover:text-brand-navy'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-brand-navy-dark text-sm text-white/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <span>
            © {CURRENT_YEAR} {SITE.name}
          </span>
          <NavLink to="/login" className="hover:text-brand-gold">
            Staff Login
          </NavLink>
        </div>
      </footer>
    </div>
  );
}
