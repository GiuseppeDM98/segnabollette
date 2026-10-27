'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { SupplyForm, type SupplyFormValues } from '@/components/supplies/supply-form';
import { SupplyKindIcon } from '@/components/supplies/supply-kind-icon';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, FormErrors } from '@/components/ui/field';
import { Stamp } from '@/components/ui/stamp';
import { buttonClass, inputClass, panelClass } from '@/components/ui/styles';
import type { SupplyKind } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/errors';
import { KIND_LABELS } from '@/lib/format';
import { resultMessages } from '@/lib/parse-input';
import { type DeletionCounts, deletionSummaryText } from './deletion-summary';
import { HouseholdEditor } from './household-editor';

export interface HousePanelSupply {
  id: string;
  kind: SupplyKind;
  label: string;
  supplierName: string | null;
  identifier: string | null;
  archived: boolean;
}

type Mode = 'idle' | 'rename' | 'new-supply' | 'delete';

/**
 * One house on «Forniture»: its supplies, rename, delete and new supply in place, and the people
 * living in it over time.
 */
export function HousePanel({
  house,
  houses,
  supplies,
  deletion,
  renameAction,
  deleteAction,
  createSupplyAction,
  household,
}: {
  house: { id: string; name: string };
  houses: Array<{ id: string; name: string }>;
  supplies: HousePanelSupply[];
  deletion: DeletionCounts;
  renameAction: (input: { name: string }) => Promise<ActionResult<null>>;
  deleteAction: () => Promise<ActionResult<null>>;
  createSupplyAction: (values: SupplyFormValues) => Promise<ActionResult<{ supplyId: string }>>;
  household: Omit<Parameters<typeof HouseholdEditor>[0], 'houseId'>;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [name, setName] = useState(house.name);
  const [messages, setMessages] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const nameId = `house-name-${house.id}`;

  function open(next: Mode) {
    setMessages([]);
    setName(house.name);
    setMode(next);
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await renameAction({ name });
    setPending(false);
    if (!result.ok) {
      setMessages(resultMessages(result));
      return;
    }
    setMode('idle');
  }

  async function remove() {
    setPending(true);
    const result = await deleteAction();
    setPending(false);
    if (!result.ok) {
      setMessages(resultMessages(result));
      setMode('idle');
    }
  }

  return (
    <section
      aria-labelledby={`house-${house.id}`}
      data-testid="house-panel"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-action pb-1.5">
        <h2 id={`house-${house.id}`} className="text-base font-bold">
          {house.name}
        </h2>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => open('rename')} className={buttonClass('quiet')}>
            Rinomina
          </button>
          <button type="button" onClick={() => open('delete')} className={buttonClass('quiet')}>
            Elimina
          </button>
        </div>
      </div>
      <FormErrors messages={mode === 'delete' ? [] : messages} />

      {mode === 'rename' && (
        <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field id={nameId} label="Nuovo nome">
              <input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={60}
                className={inputClass}
              />
            </Field>
          </div>
          <button type="submit" disabled={pending} className={buttonClass('primary')}>
            Salva nome
          </button>
          <button
            type="button"
            onClick={() => setMode('idle')}
            className={buttonClass('secondary')}
          >
            Annulla
          </button>
        </form>
      )}

      {supplies.length === 0 ? (
        <p className="text-ink-soft">Nessuna fornitura.</p>
      ) : (
        <ul className={panelClass}>
          {supplies.map((supply) => (
            <li
              key={supply.id}
              data-testid="supply-row"
              className="flex items-center gap-3 border-b border-rule px-3 py-2.5 last:border-b-0"
            >
              <SupplyKindIcon
                kind={supply.kind}
                className={`size-5 shrink-0 ${supply.archived ? 'text-ink-muted' : 'text-ink-soft'}`}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/forniture/${supply.id}`}
                  className={`font-semibold ${supply.archived ? 'text-ink-muted' : 'text-ink'}`}
                >
                  {supply.label}
                </Link>
                <p className="truncate text-xs text-ink-muted">
                  {KIND_LABELS[supply.kind]}
                  {supply.supplierName ? ` · ${supply.supplierName}` : ''}
                  {supply.identifier && (
                    <>
                      {' · '}
                      <span className="figures">{supply.identifier}</span>
                    </>
                  )}
                </p>
              </div>
              {supply.archived && <Stamp>archiviata</Stamp>}
            </li>
          ))}
        </ul>
      )}

      {mode === 'new-supply' ? (
        <SupplyForm
          houses={houses}
          initial={{
            isNew: true,
            houseId: house.id,
            kind: 'electricity',
            label: KIND_LABELS.electricity,
            supplierName: null,
            identifier: null,
            hasPhotovoltaic: false,
          }}
          submitLabel="Crea fornitura"
          onSubmit={createSupplyAction}
          onDone={() => setMode('idle')}
          onCancel={() => setMode('idle')}
        />
      ) : (
        <button
          type="button"
          onClick={() => open('new-supply')}
          className={buttonClass('secondary', 'self-start')}
        >
          Nuova fornitura
        </button>
      )}

      <HouseholdEditor houseId={house.id} {...household} />

      <ConfirmDialog
        open={mode === 'delete'}
        title={`Eliminare «${house.name}»?`}
        confirmLabel="Elimina casa"
        pending={pending}
        onConfirm={remove}
        onCancel={() => setMode('idle')}
      >
        <p data-testid="deletion-summary">{deletionSummaryText(deletion)}</p>
        <p className="text-ink-soft">Non si può annullare.</p>
      </ConfirmDialog>
    </section>
  );
}
