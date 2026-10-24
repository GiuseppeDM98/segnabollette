'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { buttonClass, inputClass, labelClass } from '@/components/ui/styles';
import { authClient } from '@/lib/auth/auth-client';

const TOO_MANY_ATTEMPTS = 'Troppi tentativi. Riprova fra qualche minuto.';
// Same text for an unknown email and a wrong password: the form never says which emails exist.
const WRONG_CREDENTIALS = 'Email o password non corretti.';

export function SignInForm({
  nextPath,
  signupEnabled,
}: {
  nextPath: string;
  signupEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsPending(true);
    setErrorMessage(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    if (error) {
      setErrorMessage(error.status === 429 ? TOO_MANY_ATTEMPTS : WRONG_CREDENTIALS);
      setIsPending(false);
      return;
    }
    router.replace(nextPath);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className={`${labelClass} flex flex-col gap-1`}>
        Email
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className={`${labelClass} flex flex-col gap-1`}>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>
      {errorMessage && (
        <p
          role="alert"
          className="rounded-sm border border-danger bg-danger-wash px-3 py-2 font-semibold text-danger"
        >
          {errorMessage}
        </p>
      )}
      <button type="submit" disabled={isPending} className={buttonClass('primary')}>
        Accedi
      </button>
      {signupEnabled && (
        <p>
          Non hai un account?{' '}
          <Link href="/registrati" className="font-semibold text-link">
            Registrati
          </Link>
        </p>
      )}
    </form>
  );
}
