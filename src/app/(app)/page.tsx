import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { getSessionUser } from '@/lib/auth/session';

export default async function HomePage() {
  // Why again after the layout: the layout passes no data down and does not re-render on client
  // navigation, so every page of the protected area reads the user itself.
  const user = await getSessionUser();
  if (!user) redirect('/accedi');
  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="mb-4 text-2xl font-semibold">Ciao, {user.name}</h1>
      <SignOutButton />
    </main>
  );
}
