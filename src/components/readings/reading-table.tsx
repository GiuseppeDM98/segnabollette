'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormErrors } from '@/components/ui/field';
import { buttonClass, columnHeaderClass } from '@/components/ui/styles';
import type { IsoDate, ReadingRegister, ReadingSource } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/errors';
import { formatDate, formatQuantity, REGISTER_LABELS } from '@/lib/format';
import { resultMessages } from '@/lib/parse-input';

// Below sm the table folds to fit a phone: supply and source join the register cell, so the
// value never needs a sideways scroll.
const HEAD = 'px-2 pb-1.5 font-bold sm:px-3';
const CELL = 'px-2 py-2 sm:px-3';
const SOURCE_LABELS: Record<ReadingSource, string> = {
  self: 'autolettura',
  bill_actual: 'da bolletta',
  bill_estimated: 'da bolletta',
};

export interface ReadingTableRow {
  id: string;
  supplyLabel: string;
  readOn: IsoDate;
  register: ReadingRegister;
  value: number;
  unit: 'kWh' | 'm3';
  source: ReadingSource;
}

/**
 * Readings newest first. Only self readings can be deleted here: the readings printed on a bill
 * change by editing the bill.
 */
export function ReadingTable({
  readings,
  showSupply = true,
  deleteAction,
}: {
  readings: ReadingTableRow[];
  showSupply?: boolean;
  deleteAction?: (readingId: string) => Promise<ActionResult<null>>;
}) {
  const [target, setTarget] = useState<ReadingTableRow | null>(null);
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  async function remove() {
    if (!target || !deleteAction) return;
    setPending(true);
    const result = await deleteAction(target.id);
    setPending(false);
    setTarget(null);
    setMessages(result.ok ? [] : resultMessages(result));
  }

  if (readings.length === 0) return <p className="text-ink-soft">Nessuna lettura.</p>;
  return (
    <div className="flex flex-col gap-3">
      <FormErrors messages={messages} />
      {/* Why focusable: on a phone the table scrolls sideways, and a keyboard must reach it. */}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs the focus */}
      <section aria-label="Elenco delle letture" tabIndex={0} className="overflow-x-auto">
        <table className="w-full border-collapse bg-surface text-left">
          <thead>
            <tr className={columnHeaderClass}>
              <th scope="col" className={HEAD}>
                Data
              </th>
              {showSupply && (
                <th scope="col" className={`${HEAD} hidden sm:table-cell`}>
                  Fornitura
                </th>
              )}
              <th scope="col" className={HEAD}>
                Registro
              </th>
              <th scope="col" className={`${HEAD} text-right`}>
                Valore
              </th>
              <th scope="col" className={`${HEAD} hidden sm:table-cell`}>
                Fonte
              </th>
              {deleteAction && (
                <th scope="col" className={HEAD}>
                  <span className="sr-only">Azioni</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {readings.map((reading) => (
              <tr key={reading.id} data-testid="reading-row" className="border-b border-rule">
                <td className={`${CELL} figures text-sm font-bold whitespace-nowrap`}>
                  {formatDate(reading.readOn)}
                </td>
                {showSupply && (
                  <td className={`${CELL} hidden sm:table-cell`}>{reading.supplyLabel}</td>
                )}
                <td className={CELL}>
                  <span className="sm:hidden">{showSupply && `${reading.supplyLabel} · `}</span>
                  {REGISTER_LABELS[reading.register]}
                  <span className="block text-xs text-ink-soft sm:hidden">
                    {SOURCE_LABELS[reading.source]}
                  </span>
                </td>
                <td className={`${CELL} figures text-right font-bold whitespace-nowrap`}>
                  {formatQuantity(reading.value, reading.unit)}
                </td>
                <td className={`${CELL} hidden text-sm text-ink-soft sm:table-cell`}>
                  {SOURCE_LABELS[reading.source]}
                </td>
                {deleteAction && (
                  <td className="px-1 py-1 text-right">
                    {reading.source === 'self' && (
                      <button
                        type="button"
                        onClick={() => setTarget(reading)}
                        className={buttonClass('quiet', 'text-sm text-danger')}
                      >
                        Elimina
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <ConfirmDialog
        open={target !== null}
        title="Eliminare l'autolettura?"
        confirmLabel="Elimina lettura"
        pending={pending}
        onConfirm={remove}
        onCancel={() => setTarget(null)}
      >
        {target && (
          <p>
            {target.supplyLabel}, {REGISTER_LABELS[target.register]}{' '}
            <span className="figures font-bold">{formatQuantity(target.value, target.unit)}</span>{' '}
            del <span className="figures">{formatDate(target.readOn)}</span>.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
