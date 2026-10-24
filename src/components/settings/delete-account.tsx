'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { CheckboxField, Field, FormErrors } from '@/components/ui/field';
import { buttonClass, inputClass } from '@/components/ui/styles';
import { authClient } from '@/lib/auth/auth-client';

const WRONG_PASSWORD = 'Password non corretta.';
const DELETE_FAILED = "Non è stato possibile eliminare l'account: riprova più tardi.";

/** The server deletes the user's data before the account (the auth hook): here only the ask. */
export function DeleteAccount() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const { error } = await authClient.deleteUser({ password });
    if (error) {
      setMessage(error.code === 'INVALID_PASSWORD' ? WRONG_PASSWORD : DELETE_FAILED);
      setPending(false);
      return;
    }
    router.replace('/accedi');
  }

  return (
    <form
      onSubmit={submit}
      data-testid="delete-account"
      className="flex flex-col gap-3 rounded-sm border border-danger p-4"
    >
      <h2 className="text-base font-bold text-danger">Elimina account</h2>
      <p className="text-ink-soft">
        Cancella l&apos;account con tutte le case, le forniture, le bollette e le letture.
      </p>
      <FormErrors messages={message ? [message] : []} />
      <Field id="delete-password" label="Password">
        <input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className={inputClass}
        />
      </Field>
      <CheckboxField
        id="delete-understood"
        label="Ho capito che bollette, letture e file vengono cancellati per sempre"
        checked={understood}
        onChange={setUnderstood}
      />
      <button
        type="submit"
        disabled={!understood || password === '' || pending}
        className={buttonClass('danger', 'self-start')}
      >
        Elimina account
      </button>
    </form>
  );
}
