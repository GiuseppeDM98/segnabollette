'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isNavItemActive, NAV_ITEMS } from './nav-items';

// Why on-brand for focus here: the global violet ring is 1.3:1 against light cloth.
const ITEM_FOCUS = 'focus-visible:outline-on-brand';

/**
 * The passbook's cover around every page of the protected area: a cloth bar at the bottom on a
 * phone, a cloth sidebar from 1024 px. Client-side only to read the path for aria-current.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh lg:flex">
      <SideBar pathname={pathname} />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1">{children}</main>
        <NavBar pathname={pathname} />
      </div>
    </div>
  );
}

function NavBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Principale"
      data-testid="nav-bar"
      className="cloth sticky bottom-0 z-10 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isNavItemActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-2xs font-bold no-underline ${ITEM_FOCUS} ${
                  active ? 'text-on-brand' : 'text-on-brand-soft'
                }`}
              >
                {/* Why 6 px below the edge: flush with it, the paper-coloured tick read as a
                    piece of the page cutting into the cloth (2026-10-25). */}
                {active && (
                  <span
                    aria-hidden="true"
                    data-testid="nav-active-tick"
                    className="absolute top-1.5 h-0.5 w-8 rounded-full bg-on-brand"
                  />
                )}
                <Icon />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SideBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Principale"
      data-testid="side-bar"
      className="cloth sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 px-3 py-5 lg:flex"
    >
      <Link
        href="/"
        className={`flex items-center gap-2.5 px-2 text-base font-extrabold text-on-brand no-underline ${ITEM_FOCUS}`}
      >
        {/* biome-ignore lint/performance/noImgElement: a 28 px SVG needs no image optimisation */}
        <img src="/brand/logo.svg" alt="" width={28} height={28} />
        Segnabollette
      </Link>
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isNavItemActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-11 items-center gap-3 rounded-xs px-3 font-bold no-underline ${ITEM_FOCUS} ${
                  active ? 'text-on-brand' : 'text-on-brand-soft hover:text-on-brand'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-2 right-0 bottom-2 w-0.5 bg-on-brand"
                  />
                )}
                <Icon />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
