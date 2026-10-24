'use client';

import { useRouter } from 'next/navigation';
import { buttonClass } from '@/components/ui/styles';
import { authClient } from '@/lib/auth/auth-client';

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace('/accedi');
  }

  return (
    <button type="button" onClick={signOut} className={buttonClass('secondary', 'self-start')}>
      Esci
    </button>
  );
}
