import { NavLink, Outlet } from 'react-router';
import { SchoolLogo } from '@/components/common/SchoolLogo';
import { SITE } from '@/config/site';

export interface PortalNavItem {
  to: string;
  label: string;
  end?: boolean;
}

/**
 * Shared shell for the authenticated portals (Admin, Teacher): navy sidebar + top bar.
 * Each portal passes its own title and navigation.
 */
export function PortalLayout({ title, nav }: { title: string; nav: PortalNavItem[] }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="flex w-64 shrink-0 flex-col bg-brand-navy text-white">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <SchoolLogo className="h-9 w-9" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{SITE.name}</div>
            <div className="text-xs text-brand-gold">{title}</div>
          </div>
        </div>
        <nav aria-label={`${title} navigation`} className="flex-1 space-y-1 p-3 text-sm">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 transition-colors ${
                  isActive
                    ? 'bg-brand-gold text-brand-navy-dark font-semibold'
                    : 'hover:bg-white/10'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
          <span className="font-semibold text-brand-navy">{title}</span>
          {/* User menu + logout arrive with Phase 1 authentication. */}
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
