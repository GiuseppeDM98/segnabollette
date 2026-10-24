'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormErrors } from '@/components/ui/field';
import { buttonClass } from '@/components/ui/styles';
import type { ActionResult } from '@/lib/errors';
import { resultMessages } from '@/lib/parse-input';

/** «Modifica» (not on a replaced bill) and «Elimina», which goes back to the supply. */
export function BillActions({
  billId,
  canEdit,
  summary,
  deleteAction,
}: {
  billId: string;
  canEdit: boolean;
  summary: string;
  deleteAction: () => Promise<ActionResult<{ supplyId: string }>>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  async function remove() {
    setPending(true);
    const result = await deleteAction();
    if (result.ok) {
      router.push(`/forniture/${result.data.supplyId}`);
      return;
    }
    setPending(false);
    setConfirming(false);
    setMessages(resultMessages(result));
  }

  return (
    <div className="flex flex-col gap-3">
      <FormErrors messages={messages} />
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Link href={`/bollette/${billId}/modifica`} className={buttonClass('primary')}>
            Modifica
          </Link>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={buttonClass('danger-outline')}
        >
          Elimina
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Eliminare la bolletta?"
        confirmLabel="Elimina bolletta"
        pending={pending}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        <p>{summary}</p>
        <p className="text-ink-soft">Con la bolletta spariscono le sue voci e le sue letture.</p>
      </ConfirmDialog>
    </div>
  );
}
