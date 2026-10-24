/** The only list of pages reachable without a session (the proxy and the tests read it). */
export const PUBLIC_PATHS = ['/accedi', '/registrati', '/offline'] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Accept only internal absolute paths as a post-login destination (no open redirect). */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}
