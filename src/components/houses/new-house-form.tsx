'use client';

import { type FormEvent, useState } from 'react';
import { Field, FormErrors } from '@/components/ui/field';
import { buttonClass, inputClass } from '@/components/ui/styles';
import type { ActionResult } from '@/lib/errors';
import { resultMessages } from '@/lib/parse-input';

export function NewHouseForm({
  onSubmit,
}: {
  onSubmit: (input: { name: string }) => Promise<ActionResult<{ houseId: string }>>;
}) {
  const [name, setName] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessages([]);
    const result = await onSubmit({ name });
    setPending(false);
    if (!result.ok) {
      setMessages(resultMessages(result));
      return;
    }
    setName('');
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="new-house-form">
      <FormErrors messages={messages} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field id="new-house-name" label="Nome della nuova casa">
            <input
              id="new-house-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={60}
              className={inputClass}
            />
          </Field>
        </div>
        <button type="submit" disabled={pending} className={buttonClass('primary')}>
          Nuova casa
        </button>
      </div>
    </form>
  );
}
