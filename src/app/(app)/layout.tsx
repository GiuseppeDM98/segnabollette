import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getSessionUser } from '@/lib/auth/session';
import { getDb } from '@/lib/container';
import { countExtractedToReview } from '@/lib/services/extractions';

/** The real guard of the protected area: the proxy only checks that a cookie is present. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/accedi');
  const reviewCount = await countExtractedToReview(getDb(), user.id);
  return <AppShell reviewCount={reviewCount}>{children}</AppShell>;
}
