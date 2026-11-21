import type { PermissionCode } from '@school/shared';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
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

interface NavGroup {
  section: string | null;
  items: PortalNavItem[];
}

/** Consecutive items with the same `section` form one group; items without a section stand alone. */
function groupNav(items: PortalNavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (item.section && last?.section === item.section) last.items.push(item);
    else groups.push({ section: item.section ?? null, items: [item] });
  }
  return groups;
}

/** The nav item for the current page: the longest matching path (so /admin/exams/grading beats /admin/exams). */
function activeItem(items: PortalNavItem[], pathname: string): PortalNavItem | undefined {
  return items
    .filter((i) =>
      i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(`${i.to}/`),
    )
    .sort((a, b) => b.to.length - a.to.length)[0];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Shared shell for the authenticated portals (Admin, Teacher): navy sidebar + top bar.
 * Navigation items the user cannot access are hidden (the API still enforces access).
 *
 * The shell fills the screen: the sidebar and top bar stay in place and only the page content
 * scrolls. Sidebar sections (People, Fees, …) collapse; one is open at a time, and the section of
 * the current page opens automatically. Printing falls back to normal document flow.
 */
export function PortalLayout({ title, nav }: { title: string; nav: PortalNavItem[] }) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const visible = nav.filter((item) => !item.permissions || can(...item.permissions));
  const groups = groupNav(visible);
  const activeSection = activeItem(visible, pathname)?.section ?? null;
  const [openSection, setOpenSection] = useState<string | null>(activeSection);
  // When the user lands on a page in another section, open that section (adjusting state while
  // rendering, as React recommends, rather than in an effect).
  const [seenSection, setSeenSection] = useState(activeSection);
  if (activeSection !== seenSection) {
    setSeenSection(activeSection);
    if (activeSection) setOpenSection(activeSection);
  }
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Start each page at the top (the content area scrolls, not the window) and keep the
    // active menu item in view.
    mainRef.current?.scrollTo?.({ top: 0 });
    requestAnimationFrame(() =>
      navRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView?.({ block: 'nearest' }),
    );
  }, [pathname]);

  const link = (item: PortalNavItem, nested: boolean) => (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `block rounded-md py-2 transition-colors ${nested ? 'pl-6 pr-3' : 'px-3'} ${
          isActive ? 'bg-brand-gold font-semibold text-brand-navy-dark' : 'hover:bg-white/10'
        }`
      }
    >
      {item.label}
    </NavLink>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-surface print:block print:h-auto print:overflow-visible print:bg-white">
      <aside className="flex h-full w-64 shrink-0 flex-col bg-brand-navy text-white print:hidden">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4"
        >
          <SchoolLogo className="h-9 w-9" onDark />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{SITE.name}</div>
            <div className="text-xs text-brand-gold">{title}</div>
          </div>
        </Link>
        <nav
          ref={navRef}
          aria-label={`${title} navigation`}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 text-sm [scrollbar-color:rgb(255_255_255/0.25)_transparent] [scrollbar-width:thin]"
        >
          {groups.map((g) => {
            if (!g.section) return <div key={g.items[0].to}>{link(g.items[0], false)}</div>;
            const open = openSection === g.section;
            const current = activeSection === g.section;
            const listId = `nav-${slug(g.section)}`;
            return (
              <div key={g.section} data-nav-group={g.section}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => setOpenSection(open ? null : g.section)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-medium transition-colors hover:bg-white/10 ${
                    current ? 'text-brand-gold' : 'text-white/90'
                  }`}
                >
                  <span>{g.section}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                <ul id={listId} hidden={!open} className="mt-1 space-y-1">
                  {g.items.map((item) => (
                    <li key={item.to}>{link(item, true)}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col print:block">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 print:hidden">
          <span className="font-semibold text-brand-navy">{title}</span>
          <UserMenu />
        </header>
        <main
          ref={mainRef}
          className="min-h-0 flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0"
        >
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
