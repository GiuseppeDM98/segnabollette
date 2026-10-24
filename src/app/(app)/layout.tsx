import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getSessionUser } from '@/lib/auth/session';

/** The real guard of the protected area: the proxy only checks that a cookie is present. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/accedi');
  return <AppShell>{children}</AppShell>;
}
