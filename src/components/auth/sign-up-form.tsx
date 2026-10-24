'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { buttonClass, hintClass, inputClass, labelClass } from '@/components/ui/styles';
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className={`${labelClass} flex flex-col gap-1`}>
        Nome
        <input name="name" type="text" autoComplete="name" required className={inputClass} />
      </label>
      <label className={`${labelClass} flex flex-col gap-1`}>
        Email
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className={`${labelClass} flex flex-col gap-1`}>
        Password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-describedby="password-hint"
          className={inputClass}
        />
        <span id="password-hint" className={hintClass}>
          almeno 8 caratteri
        </span>
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
        Crea account
      </button>
    </form>
  );
}
