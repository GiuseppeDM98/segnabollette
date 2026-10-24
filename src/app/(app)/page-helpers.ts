import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from '@/lib/auth/session';
import { DomainError } from '@/lib/errors';
import type { DashboardRange } from '@/lib/services/dashboard';

/**
 * The user of a protected page. Why again after the layout: the layout passes no data down and
 * does not re-render on client navigation, so every page reads the user itself.
 */
export async function pageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/accedi');
  return user;
}

/** A service's NOT_FOUND (a missing id, or someone else's) becomes the 404 page. */
export async function orNotFound<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}

/** One value of a query parameter; a repeated parameter counts as absent. */
export function queryValue(raw: string | string[] | undefined): string | undefined {
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
}

/** `?pagina=`: an integer from 1, anything else is page 1. */
export function pageNumber(raw: string | string[] | undefined): number {
  const text = queryValue(raw);
  if (text === undefined || !/^\d+$/.test(text)) return 1;
  const page = Number(text);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** `?periodo=` as the query writes it, and the dashboard range it selects. */
export const PERIOD_QUERIES: Record<DashboardRange, string> = {
  '12': '12',
  '24': '24',
  all: 'tutto',
};

/** `?periodo=`: 12, 24 or tutto; anything else is the default, 24 months. */
export function dashboardRange(raw: string | string[] | undefined): DashboardRange {
  const text = queryValue(raw);
  if (text === PERIOD_QUERIES['12']) return '12';
  if (text === PERIOD_QUERIES.all) return 'all';
  return '24';
}
