import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import { isPublicPath } from '@/lib/auth/public-paths';

/**
 * Optimistic redirect only: it checks that a session cookie is present, not that it is valid. The
 * (app) layout and requireUser() are the real guard.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || getSessionCookie(request)) return NextResponse.next();
  const login = new URL('/accedi', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // API routes check the session themselves; static files, the manifest and the service worker
  // stay public.
  matcher: [
    '/((?!api|_next|favicon.ico|manifest.webmanifest|sw.js|icons|brand|.*\\.[a-z0-9]+$).*)',
  ],
};
