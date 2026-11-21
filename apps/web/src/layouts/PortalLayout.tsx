import type { PermissionCode } from '@school/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { SchoolLogo } from '@/components/common/SchoolLogo';
import { SITE } from '@/config/site';
import { useAuth } from '@/features/auth/auth-context';

export interface PortalNavItem {
  to: string;
  label: string;
  end?: boolean;
  /** Hidden unless the user holds all of these permissions. */
  permissions?: PermissionCode[];
  /** Optional group heading shown above the first item of each section. */
  section?: string;
}

/**
 * Shared shell for the authenticated portals (Admin, Teacher): navy sidebar + top bar.
 * Navigation items the user cannot access are hidden (the API still enforces access).
 */
export function PortalLayout({ title, nav }: { title: string; nav: PortalNavItem[] }) {
  const { can } = useAuth();
  const visible = nav.filter((item) => !item.permissions || can(...item.permissions));

  return (
    <div className="flex min-h-screen bg-surface print:block print:bg-white">
      <aside className="flex w-64 shrink-0 flex-col bg-brand-navy text-white print:hidden">
        <Link to="/" className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <SchoolLogo className="h-9 w-9" onDark />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{SITE.name}</div>
            <div className="text-xs text-brand-gold">{title}</div>
          </div>
        </Link>
        <nav
          aria-label={`${title} navigation`}
          className="flex-1 space-y-1 overflow-y-auto p-3 text-sm"
        >
          {visible.map((item, i) => (
            <div key={item.to}>
              {item.section && item.section !== visible[i - 1]?.section && (
                <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  {item.section}
                </p>
              )}
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 transition-colors ${
                    isActive
                      ? 'bg-brand-gold font-semibold text-brand-navy-dark'
                      : 'hover:bg-white/10'
                  }`
                }
              >
                {item.label}
              </NavLink>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6 print:hidden">
          <span className="font-semibold text-brand-navy">{title}</span>
          <UserMenu />
        </header>
        <main className="flex-1 p-6 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;
  const initials = user.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block font-medium text-ink">{user.fullName}</span>
          <span className="block text-xs text-ink-muted">{user.roles.join(', ')}</span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          <button
            role="menuitem"
            className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              navigate('/change-password');
            }}
          >
            Change password
          </button>
          <button
            role="menuitem"
            className="block w-full px-4 py-2 text-left text-sm text-red-700 hover:bg-gray-50"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
