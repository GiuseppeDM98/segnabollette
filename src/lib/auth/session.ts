import 'server-only';
import { headers } from 'next/headers';
import { DomainError } from '@/lib/errors';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/** Every Server Action and route handler starts here; userId never comes from the client. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new DomainError('UNAUTHORIZED');
  return user;
}
