'use client';

import { type FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, FormErrors } from '@/components/ui/field';
import { buttonClass, figureInputClass, inputClass, panelClass } from '@/components/ui/styles';
import type { ActionResult } from '@/lib/errors';
import { formatDate, formatPeople } from '@/lib/format';
import { resultMessages } from '@/lib/parse-input';

export interface HouseholdEntry {
  id: string;
  validFrom: string;
  people: number;
}

/**
 * The people in a house over time, on «Forniture»: each change («dal 18/09/2023 · 3 persone»)
 * holds until the next. A wrong one is deleted and typed again; there is no edit in place.
 */
export function HouseholdEditor({
  houseId,
  entries,
  today,
  addAction,
  deleteAction,
}: {
  houseId: string;
  entries: HouseholdEntry[];
  today: string;
  addAction: (input: {
    validFrom: string;
    people: number;
  }) => Promise<ActionResult<{ householdSizeId: string }>>;
  deleteAction: (householdSizeId: string) => Promise<ActionResult<null>>;
}) {
  const [validFrom, setValidFrom] = useState('');
  const [people, setPeople] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<HouseholdEntry | null>(null);
  const dateId = `household-from-${houseId}`;
  const peopleId = `household-people-${houseId}`;
  const headingId = `household-${houseId}`;

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await addAction({ validFrom, people: Number(people) });
    setPending(false);
    if (!result.ok) {
      setMessages(resultMessages(result));
      return;
    }
    setMessages([]);
    setValidFrom('');
    setPeople('');
  }

  async function remove(entry: HouseholdEntry) {
    setPending(true);
    const result = await deleteAction(entry.id);
    setPending(false);
    setDeleting(null);
    setMessages(result.ok ? [] : resultMessages(result));
  }

  const entryText = (entry: HouseholdEntry) =>
    `dal ${formatDate(entry.validFrom)}, ${formatPeople(entry.people)}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2" data-testid="household">
      <h3 id={headingId} className="text-sm font-bold">
        Persone in casa
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Non indicate. Con le persone, i grafici dei costi segnano quando cambiano e la spesa si
          legge anche per persona.
        </p>
      ) : (
        <ul className={panelClass}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid="household-entry"
              className="flex items-center justify-between gap-3 border-b border-rule px-3 py-1.5 last:border-b-0"
            >
              <span className="figures text-sm">
                dal <span className="font-bold">{formatDate(entry.validFrom)}</span> ·{' '}
                {formatPeople(entry.people)}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => setDeleting(entry)}
                className={buttonClass('quiet', 'text-sm')}
                aria-label={`Elimina: ${entryText(entry)}`}
              >
                Elimina
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormErrors messages={messages} />
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Field id={dateId} label="Dal">
            <input
              id={dateId}
              type="date"
              required
              value={validFrom}
              max={today}
              onChange={(event) => setValidFrom(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="w-24">
          <Field id={peopleId} label="Persone">
            <input
              id={peopleId}
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={20}
              step={1}
              value={people}
              onChange={(event) => setPeople(event.target.value)}
              className={figureInputClass}
            />
          </Field>
        </div>
        <button type="submit" disabled={pending} className={buttonClass('secondary')}>
          Aggiungi
        </button>
      </form>
      <ConfirmDialog
        open={deleting !== null}
        title="Eliminare questo cambio?"
        confirmLabel="Elimina"
        pending={pending}
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
        onCancel={() => setDeleting(null)}
      >
        <p>{deleting ? `Persone in casa ${entryText(deleting)}.` : ''}</p>
      </ConfirmDialog>
    </section>
  );
}
