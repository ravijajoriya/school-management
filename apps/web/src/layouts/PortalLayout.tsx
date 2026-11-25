import type { PermissionCode } from '@school/shared';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  icon?: LucideIcon;
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

const today = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Kolkata',
});

/**
 * Shared shell for the authenticated portals (Admin, Teacher): navy sidebar + top bar.
 * Navigation items the user cannot access are hidden (the API still enforces access).
 *
 * The shell fills the screen: the sidebar and top bar stay in place and only the page content
 * scrolls. Sidebar sections (People, Fees, …) collapse with a short animation; one is open at a
 * time, and the section of the current page opens automatically. Printing falls back to normal
 * document flow.
 */
export function PortalLayout({
  title,
  nav,
  sectionIcons = {},
}: {
  title: string;
  nav: PortalNavItem[];
  sectionIcons?: Record<string, LucideIcon>;
}) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const visible = nav.filter((item) => !item.permissions || can(...item.permissions));
  const groups = groupNav(visible);
  const current = activeItem(visible, pathname);
  const activeSection = current?.section ?? null;
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

  const link = (item: PortalNavItem, nested: boolean) => {
    const Icon = item.icon;
    return (
      <NavLink
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `group flex items-center gap-3 rounded-lg py-2 transition-all duration-150 ${
            nested ? 'pl-4 pr-3' : 'px-3'
          } ${
            isActive
              ? 'bg-gradient-to-r from-brand-gold to-amber-400 font-semibold text-brand-navy-dark shadow-md shadow-black/20'
              : 'text-white/80 hover:translate-x-0.5 hover:bg-white/10 hover:text-white'
          }`
        }
      >
        {({ isActive }) => (
          <>
            {Icon && (
              <Icon
                className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                  isActive ? 'text-brand-navy-dark' : 'text-white/60 group-hover:text-brand-gold'
                }`}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{item.label}</span>
          </>
        )}
      </NavLink>
    );
  };

  const CurrentIcon = current?.icon;
  const [todayLabel] = useState(() => today.format(new Date()));
  return (
    <div className="flex h-dvh overflow-hidden bg-surface print:block print:h-auto print:overflow-visible print:bg-white">
      <aside className="relative flex h-full w-[17rem] shrink-0 flex-col bg-gradient-to-b from-brand-navy via-brand-navy to-brand-navy-dark text-white shadow-xl shadow-brand-navy/20 print:hidden">
        <span
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-gold via-amber-300 to-brand-gold"
          aria-hidden="true"
        />
        <Link
          to="/"
          className="group flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4"
        >
          <SchoolLogo
            className="h-9 w-9 transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105"
            onDark
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{SITE.name}</div>
            <div className="text-xs font-medium text-brand-gold">{title}</div>
          </div>
        </Link>
        <nav
          ref={navRef}
          aria-label={`${title} navigation`}
          className="portal-nav-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 text-sm"
        >
          {groups.map((g) => {
            if (!g.section) return <div key={g.items[0].to}>{link(g.items[0], false)}</div>;
            const open = openSection === g.section;
            const isCurrent = activeSection === g.section;
            const listId = `nav-${slug(g.section)}`;
            const SectionIcon = sectionIcons[g.section];
            return (
              <div key={g.section} data-nav-group={g.section}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => setOpenSection(open ? null : g.section)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left font-medium transition-colors hover:bg-white/10 ${
                    isCurrent ? 'text-brand-gold' : 'text-white/90'
                  } ${open ? 'bg-white/5' : ''}`}
                >
                  {SectionIcon && (
                    <SectionIcon
                      className="h-[18px] w-[18px] shrink-0 opacity-80"
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex-1">{g.section}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {/* Collapsed groups stay in the page so they can animate, but are inert and hidden
                    from assistive technology (and from keyboard focus). */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                    open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                  inert={!open}
                  aria-hidden={!open}
                >
                  <ul
                    id={listId}
                    className="ml-[1.1rem] space-y-0.5 overflow-hidden border-l border-white/10 pl-2"
                  >
                    {g.items.map((item, i) => (
                      <li
                        key={item.to}
                        className={i === 0 ? 'pt-1' : i === g.items.length - 1 ? 'pb-1' : ''}
                      >
                        {link(item, true)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </nav>
        <Link
          to="/"
          className="m-3 flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:border-brand-gold/50 hover:bg-white/5 hover:text-brand-gold"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> View public website
        </Link>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col print:block">
        <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200/80 bg-white/90 px-6 backdrop-blur print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            {CurrentIcon && (
              <span
                key={pathname}
                className="flex h-9 w-9 shrink-0 animate-scale-in items-center justify-center rounded-xl bg-brand-navy/5 text-brand-navy ring-1 ring-brand-navy/10"
              >
                <CurrentIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <div
                className="flex items-center gap-1 text-xs text-ink-muted"
                aria-label="You are here"
              >
                <span>{title}</span>
                {current?.section && (
                  <>
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                    <span>{current.section}</span>
                  </>
                )}
              </div>
              <div className="truncate font-semibold text-brand-navy">
                {current?.label ?? title}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-ink-muted lg:block">{todayLabel}</span>
            <UserMenu />
          </div>
        </header>
        <main
          ref={mainRef}
          className="portal-main portal-scroll min-h-0 flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0"
        >
          <div key={pathname} className="animate-fade-up print:animate-none">
            <Outlet />
          </div>
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
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
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 text-sm transition-colors hover:bg-gray-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-navy to-brand-navy-light text-xs font-semibold text-white ring-2 ring-brand-gold/60 ring-offset-1">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block font-medium text-ink">{user.fullName}</span>
          <span className="block text-xs text-ink-muted">{user.roles.join(', ')}</span>
        </span>
        <ChevronDown
          className={`hidden h-4 w-4 text-ink-muted transition-transform sm:block ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-60 origin-top-right animate-slide-down overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-brand-navy/10"
        >
          <div className="border-b border-gray-100 bg-gradient-to-br from-brand-gold-light/60 to-white px-4 py-3">
            <div className="truncate text-sm font-semibold text-brand-navy">{user.fullName}</div>
            <div className="truncate text-xs text-ink-muted">{user.email ?? user.phone}</div>
          </div>
          <div className="py-1">
            <button
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-gray-50"
              onClick={() => {
                setOpen(false);
                navigate('/change-password');
              }}
            >
              <KeyRound className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              Change password
            </button>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-700 transition-colors hover:bg-red-50"
              onClick={async () => {
                setOpen(false);
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
