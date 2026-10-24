'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth/auth-client';

// One message for every server error, the email already in use included: the form must not
// reveal which emails are registered. The password limits are enforced by the field itself.
const SIGN_UP_FAILED = 'Registrazione non riuscita. Riprova.';

export function SignUpForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsPending(true);
    setErrorMessage(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get('name')),
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    if (error) {
      setErrorMessage(SIGN_UP_FAILED);
      setIsPending(false);
      return;
    }
    router.replace('/');
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        Nome
        <input name="name" type="text" autoComplete="name" required className="border p-2" />
      </label>
      <label className="flex flex-col gap-1">
        Email
        <input name="email" type="email" autoComplete="email" required className="border p-2" />
      </label>
      <label className="flex flex-col gap-1">
        Password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-describedby="password-hint"
          className="border p-2"
        />
        <span id="password-hint" className="text-sm">
          almeno 8 caratteri
        </span>
      </label>
      {errorMessage && (
        <p role="alert" className="text-red-700">
          {errorMessage}
        </p>
      )}
      <button type="submit" disabled={isPending} className="border p-2">
        Crea account
      </button>
    </form>
  );
}
