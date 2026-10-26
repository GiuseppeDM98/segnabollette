'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { discardExtractionAction } from '@/app/(app)/bollette/revisione/[id]/actions';
import { FormErrors } from '@/components/ui/field';
import { buttonClass, panelClass } from '@/components/ui/styles';
import { formatUsd } from '@/lib/format';
import { resultMessages } from '@/lib/parse-input';
import { apiMessages, requestRun } from './extraction-api';

/** A running extraction older than this is dead and can be retried or discarded (as on the server). */
const STALE_RUN_MS = 360_000;

/** One extraction waiting for the owner, as «Da rivedere» shows it (all of them, or one batch's). */
export interface PendingListItem {
  id: string;
  status: 'queued' | 'running' | 'extracted' | 'failed';
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: number | null;
  estimatedCostMicroUsd: number | null;
  /** The supply, or the file in a batch; null reads «da assegnare». */
  title: string | null;
  /** The figure on the right: when it was uploaded, or where its period starts in a batch. */
  detail: { prefix: string; figure: string } | null;
}

function statusText(extraction: PendingListItem): string {
  switch (extraction.status) {
    case 'queued':
      return 'in coda';
    case 'running':
      return 'in corso';
    case 'extracted':
      return 'da rivedere';
    case 'failed':
      return `fallita: ${extraction.errorMessage ?? 'errore sconosciuto'}`;
  }
}

/** «Da rivedere»: each extraction with the actions its state allows. */
export function PendingExtractionList({
  extractions,
  now,
}: {
  extractions: PendingListItem[];
  /** The server's instant of the page: a run older than six minutes is dead. */
  now: number;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function onRun(extractionId: string) {
    setErrors([]);
    setWorking(extractionId);
    const result = await requestRun(extractionId);
    setWorking(null);
    if (result.ok && result.data.status === 'extracted') {
      router.push(`/bollette/revisione/${extractionId}`);
      return;
    }
    if (!result.ok) setErrors(apiMessages(result));
    router.refresh();
  }

  async function onDiscard(extractionId: string) {
    setErrors([]);
    setWorking(extractionId);
    const result = await discardExtractionAction(extractionId);
    setWorking(null);
    if (!result.ok) setErrors(resultMessages(result));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <FormErrors messages={errors} />
      <ul className={panelClass}>
        {extractions.map((extraction) => {
          const stale =
            extraction.status === 'running' && (extraction.startedAt ?? 0) < now - STALE_RUN_MS;
          const canRetry =
            (extraction.status === 'failed' && extraction.errorCode !== 'document_invalid') ||
            stale;
          const canDiscard = extraction.status !== 'running' || stale;
          const isWorking = working === extraction.id;
          return (
            <li
              key={extraction.id}
              data-testid="pending-extraction"
              className="flex flex-col gap-2 border-b border-rule px-3 py-3 last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                {extraction.title ? (
                  <span className="font-semibold">{extraction.title}</span>
                ) : (
                  <span className="text-ink-soft">da assegnare</span>
                )}
                {extraction.detail && (
                  <span className="text-sm text-ink-soft">
                    {extraction.detail.prefix}
                    <span className="figures">{extraction.detail.figure}</span>
                  </span>
                )}
              </div>
              <p className={extraction.status === 'failed' ? 'text-danger' : 'text-ink-soft'}>
                {isWorking && extraction.status !== 'extracted'
                  ? 'Estrazione in corso…'
                  : statusText(extraction)}
              </p>
              <div className="flex flex-wrap gap-2">
                {extraction.status === 'extracted' && (
                  <Link
                    href={`/bollette/revisione/${extraction.id}`}
                    className={buttonClass('primary', 'text-sm')}
                  >
                    Rivedi
                  </Link>
                )}
                {extraction.status === 'queued' && (
                  <button
                    type="button"
                    className={buttonClass('primary', 'text-sm')}
                    disabled={working !== null}
                    onClick={() => onRun(extraction.id)}
                  >
                    Estrai (circa {formatUsd(extraction.estimatedCostMicroUsd ?? 0)})
                  </button>
                )}
                {canRetry && (
                  <button
                    type="button"
                    className={buttonClass('primary', 'text-sm')}
                    disabled={working !== null}
                    onClick={() => onRun(extraction.id)}
                  >
                    Riprova
                  </button>
                )}
                {canDiscard && (
                  <button
                    type="button"
                    className={buttonClass('secondary', 'text-sm')}
                    disabled={working !== null}
                    onClick={() => onDiscard(extraction.id)}
                  >
                    Scarta
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
