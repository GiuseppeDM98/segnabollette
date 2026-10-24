'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type DeletionCounts, deletionSummaryText } from '@/components/houses/deletion-summary';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormErrors } from '@/components/ui/field';
import { buttonClass } from '@/components/ui/styles';
import type { ActionResult } from '@/lib/errors';
import { resultMessages } from '@/lib/parse-input';
import { SupplyForm, type SupplyFormValues } from './supply-form';

/** «Modifica», «Archivia»/«Riattiva» and «Elimina» on a supply's page. */
export function SupplyActions({
  supply,
  houses,
  archived,
  deletion,
  updateAction,
  archiveAction,
  deleteAction,
}: {
  supply: SupplyFormValues;
  houses: Array<{ id: string; name: string }>;
  archived: boolean;
  deletion: DeletionCounts;
  updateAction: (patch: Omit<SupplyFormValues, 'kind'>) => Promise<ActionResult<null>>;
  archiveAction: (archived: boolean) => Promise<ActionResult<null>>;
  deleteAction: () => Promise<ActionResult<null>>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'edit' | 'delete'>('idle');
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  async function run(action: () => Promise<ActionResult<null>>, after?: () => void) {
    setPending(true);
    setMessages([]);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setMessages(resultMessages(result));
      setMode('idle');
      return;
    }
    after?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <FormErrors messages={messages} />
      {mode === 'edit' ? (
        <SupplyForm
          houses={houses}
          initial={{ ...supply, isNew: false }}
          submitLabel="Salva fornitura"
          onSubmit={({ kind: _kind, ...patch }) => updateAction(patch)}
          onDone={() => setMode('idle')}
          onCancel={() => setMode('idle')}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={buttonClass('secondary')}
          >
            Modifica
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => archiveAction(!archived))}
            className={buttonClass('secondary')}
          >
            {archived ? 'Riattiva' : 'Archivia'}
          </button>
          <button
            type="button"
            onClick={() => setMode('delete')}
            className={buttonClass('danger-outline')}
          >
            Elimina
          </button>
        </div>
      )}
      <ConfirmDialog
        open={mode === 'delete'}
        title={`Eliminare «${supply.label}»?`}
        confirmLabel="Elimina fornitura"
        pending={pending}
        onConfirm={() => run(deleteAction, () => router.push('/forniture'))}
        onCancel={() => setMode('idle')}
      >
        <p data-testid="deletion-summary">{deletionSummaryText(deletion)}</p>
        <p className="text-ink-soft">Non si può annullare.</p>
      </ConfirmDialog>
    </div>
  );
}
