'use client';

import { nanoid } from 'nanoid';
/**
 * The bulk import, in four steps on one page: choose up to 50 files (each one a whole bill),
 * upload them three at a time, show what extracting them would cost, and only at «Avvia
 * estrazione» run the queue, two at a time, from this browser. The state of every extraction
 * lives in the database under the batch id made here, so a page closed halfway is resumed from
 * «Lotti in sospeso»; opening or reloading a page never starts an extraction.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useId, useState } from 'react';
import { buttonClass, inputClass, labelClass, panelClass } from '@/components/ui/styles';
import { apiMessages, postJson } from '@/components/upload/extraction-api';
import { MAX_PHOTO_BYTES } from '@/lib/blob/types';
import { uploadDocumentFile } from '@/lib/blob/upload-client';
import type { DocumentContentType } from '@/lib/domain/types';
import { formatFileSize, formatUsd } from '@/lib/format';
import { type QueueItemResult, runQueue, toQueueItemResult } from '@/lib/import/queue-runner';
import { compressPhoto, UnsupportedPhotoError } from '@/lib/upload/compress-photo';
import { useWakeLock } from './use-wake-lock';

const MAX_FILES = 50;
const UPLOAD_CONCURRENCY = 3;
const EXTRACTION_CONCURRENCY = 2;

/** A row of a batch already on the server, for a resumed batch. */
export interface ImportBatchRow {
  id: string;
  status: 'queued' | 'running' | 'extracted' | 'failed';
  errorCode: string | null;
  errorMessage: string | null;
  fileLabel: string;
  estimatedCostMicroUsd: number | null;
}

export interface BulkImporterProps {
  /** The supplies to assign the whole batch to; none chosen = recognised from each bill. */
  supplies?: Array<{ id: string; label: string }>;
  /** A batch to resume: the importer opens at the extraction step with its rows. */
  batch?: { batchId: string; rows: ImportBatchRow[] };
}

interface PlannedDocument {
  documentId: string;
  pathname: string;
  contentType: DocumentContentType;
}

type CreateAnswer =
  | { extractionId: string; documents: PlannedDocument[] }
  | { duplicateOf: string; duplicateStatus: string; documents?: PlannedDocument[] };

interface UploadedAnswer {
  pdfPages: number;
  photos: number;
  estimatedCostMicroUsd: number;
}

/** A file ready to be declared to the server: what it is, its bytes and their SHA-256. */
interface Prepared {
  blob: Blob;
  contentType: DocumentContentType;
  sha256: string;
}

/** Where a chosen file stands before it becomes an extraction of the batch. */
type UploadState =
  | { kind: 'chosen' }
  | { kind: 'uploading' }
  | { kind: 'duplicate'; of: string }
  | { kind: 'present'; billId: string | null }
  | { kind: 'already-uploaded' }
  | { kind: 'invalid'; message: string }
  | { kind: 'not-uploaded'; message: string }
  | { kind: 'done' };

/** An extraction of the batch, from «pronta» to its outcome. */
interface ExtractionState {
  id: string;
  status: 'ready' | 'queued' | 'running' | 'extracted' | 'failed';
  errorCode: string | null;
  errorMessage: string | null;
  fileLabel: string;
  pdfPages: number;
  photos: number;
  estimatedCostMicroUsd: number;
}

interface Row {
  key: string;
  /** The file's name, or the file label of a resumed batch (the server keeps no file names). */
  name: string;
  file: File | null;
  prepared: Prepared | null;
  upload: UploadState;
  extraction: ExtractionState | null;
}

type Phase = 'choose' | 'uploading' | 'ready' | 'running' | 'paused' | 'done';

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A photo is converted to JPEG first, as in the single upload; a PDF is sent as it is. */
async function prepareFile(file: File): Promise<Prepared> {
  if (isPdf(file)) {
    return { blob: file, contentType: 'application/pdf', sha256: await sha256Hex(file) };
  }
  const blob = await compressPhoto(file);
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error('Una foto supera i 5 MB anche dopo la compressione.');
  }
  return { blob, contentType: 'image/jpeg', sha256: await sha256Hex(blob) };
}

function preparationMessage(error: unknown): string {
  if (error instanceof UnsupportedPhotoError || error instanceof Error) return error.message;
  return 'File non leggibile.';
}

function fileLabelOf(answer: UploadedAnswer): string {
  if (answer.photos > 0) return 'Foto';
  return `PDF, ${answer.pdfPages} ${answer.pdfPages === 1 ? 'pagina' : 'pagine'}`;
}

/** Run `work` on every item, at most `limit` at a time. */
async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  const pending = [...items];
  const worker = async () => {
    for (let item = pending.shift(); item !== undefined; item = pending.shift()) await work(item);
  };
  await Promise.all(Array.from({ length: Math.min(limit, pending.length) }, worker));
}

function rowsOfBatch(rows: readonly ImportBatchRow[]): Row[] {
  return rows.map((row) => ({
    key: row.id,
    name: row.fileLabel,
    file: null,
    prepared: null,
    upload: { kind: 'done' },
    extraction: {
      id: row.id,
      status: row.status,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      fileLabel: row.fileLabel,
      pdfPages: 0,
      photos: 0,
      estimatedCostMicroUsd: row.estimatedCostMicroUsd ?? 0,
    },
  }));
}

function isResumable(extraction: ExtractionState | null): extraction is ExtractionState {
  return (
    extraction !== null &&
    (extraction.status === 'queued' ||
      (extraction.status === 'failed' && extraction.errorCode === 'unavailable'))
  );
}

export function BulkImporter({ supplies = [], batch }: BulkImporterProps) {
  const router = useRouter();
  const id = useId();
  const [batchId] = useState(() => batch?.batchId ?? nanoid());
  const [supplyId, setSupplyId] = useState('');
  const [rows, setRows] = useState<Row[]>(() => (batch ? rowsOfBatch(batch.rows) : []));
  const [phase, setPhase] = useState<Phase>(batch ? 'ready' : 'choose');
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [notStarted, setNotStarted] = useState<string[]>([]);
  const [retrying, setRetrying] = useState(0);
  useWakeLock(phase === 'running');

  const resuming = batch !== undefined;

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function patchExtraction(extractionId: string, patch: Partial<ExtractionState>) {
    setRows((current) =>
      current.map((row) =>
        row.extraction?.id === extractionId
          ? { ...row, extraction: { ...row.extraction, ...patch } }
          : row,
      ),
    );
  }

  // Step 1: the choice.

  function onFilesChosen(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (chosen.length === 0) return;
    const added: Row[] = chosen.map((file) => ({
      key: nanoid(),
      name: file.name,
      file,
      prepared: null,
      upload: { kind: 'chosen' },
      extraction: null,
    }));
    const all = [...rows, ...added];
    setCapMessage(
      all.length > MAX_FILES ? 'Al massimo 50 file per volta: tengo i primi 50.' : null,
    );
    setRows(all.slice(0, MAX_FILES));
  }

  function removeRow(key: string) {
    setCapMessage(null);
    setRows((current) => current.filter((row) => row.key !== key));
  }

  // Step 2: the upload of one file, from its declaration to the server's check of the bytes.

  async function uploadPrepared(row: Row, prepared: Prepared): Promise<void> {
    const created = await postJson<CreateAnswer>('/api/extractions', {
      supplyId: supplyId === '' ? null : supplyId,
      batchId,
      files: [
        {
          sha256: prepared.sha256,
          contentType: prepared.contentType,
          sizeBytes: prepared.blob.size,
        },
      ],
    });
    if (!created.ok) {
      if (created.code === 'DUPLICATE_DOCUMENT') {
        const details = created.details as { billId?: unknown } | undefined;
        const billId = typeof details?.billId === 'string' ? details.billId : null;
        patchRow(row.key, { upload: { kind: 'present', billId } });
        return;
      }
      patchRow(row.key, {
        upload: { kind: 'not-uploaded', message: apiMessages(created).join(' ') },
      });
      return;
    }

    let extractionId: string;
    let documents: PlannedDocument[];
    if ('extractionId' in created.data) {
      ({ extractionId, documents } = created.data);
    } else if (created.data.duplicateStatus === 'uploading') {
      // The same file of this batch whose upload was interrupted: upload it again where planned.
      extractionId = created.data.duplicateOf;
      documents = created.data.documents ?? [];
    } else {
      patchRow(row.key, { upload: { kind: 'already-uploaded' } });
      return;
    }

    const [document] = documents;
    if (!document) {
      patchRow(row.key, { upload: { kind: 'not-uploaded', message: 'Risposta inattesa.' } });
      return;
    }
    try {
      await uploadDocumentFile({
        file: prepared.blob,
        pathname: document.pathname,
        documentId: document.documentId,
        contentType: document.contentType,
      });
    } catch {
      patchRow(row.key, { upload: { kind: 'not-uploaded', message: 'Caricamento non riuscito.' } });
      return;
    }

    const uploaded = await postJson<UploadedAnswer>(`/api/extractions/${extractionId}/uploaded`);
    if (!uploaded.ok) {
      patchRow(row.key, {
        upload:
          uploaded.code === 'DOCUMENT_INVALID'
            ? { kind: 'invalid', message: uploaded.message }
            : { kind: 'not-uploaded', message: apiMessages(uploaded).join(' ') },
      });
      return;
    }
    patchRow(row.key, {
      upload: { kind: 'done' },
      extraction: {
        id: extractionId,
        status: 'ready',
        errorCode: null,
        errorMessage: null,
        fileLabel: fileLabelOf(uploaded.data),
        pdfPages: uploaded.data.pdfPages,
        photos: uploaded.data.photos,
        estimatedCostMicroUsd: uploaded.data.estimatedCostMicroUsd,
      },
    });
  }

  async function uploadRow(row: Row, prepared: Prepared): Promise<void> {
    patchRow(row.key, { upload: { kind: 'uploading' } });
    try {
      await uploadPrepared(row, prepared);
    } catch {
      patchRow(row.key, { upload: { kind: 'not-uploaded', message: 'Errore inatteso.' } });
    }
  }

  async function onUpload() {
    setCapMessage(null);
    setPhase('uploading');
    // Converted and hashed first, so that the same file chosen twice is caught before any call:
    // two creations with the same SHA-256 would race for the unique index.
    const firstBySha = new Map<string, string>();
    const toUpload: Array<{ row: Row; prepared: Prepared }> = [];
    for (const row of rows) {
      if (!row.file) continue;
      let prepared: Prepared;
      try {
        prepared = await prepareFile(row.file);
      } catch (error) {
        patchRow(row.key, {
          upload: { kind: 'not-uploaded', message: preparationMessage(error) },
        });
        continue;
      }
      const first = firstBySha.get(prepared.sha256);
      if (first !== undefined) {
        patchRow(row.key, { prepared, upload: { kind: 'duplicate', of: first } });
        continue;
      }
      firstBySha.set(prepared.sha256, row.name);
      patchRow(row.key, { prepared });
      toUpload.push({ row, prepared });
    }
    await forEachLimited(toUpload, UPLOAD_CONCURRENCY, ({ row, prepared }) =>
      uploadRow(row, prepared),
    );
    setPhase('ready');
  }

  /** «Riprova» on a file that did not upload: the same step, the same batch. */
  async function onRetryUpload(row: Row) {
    if (!row.file) return;
    setRetrying((count) => count + 1);
    try {
      let prepared = row.prepared;
      if (!prepared) {
        try {
          prepared = await prepareFile(row.file);
        } catch (error) {
          patchRow(row.key, {
            upload: { kind: 'not-uploaded', message: preparationMessage(error) },
          });
          return;
        }
        patchRow(row.key, { prepared });
      }
      await uploadRow(row, prepared);
    } finally {
      setRetrying((count) => count - 1);
    }
  }

  // Step 4: the queue, two at a time; it pauses on the first answer that means "try later".

  async function runExtractions(ids: string[]) {
    setPhase('running');
    for (const extractionId of ids) patchExtraction(extractionId, { status: 'queued' });
    const outcome = await runQueue({
      ids,
      concurrency: EXTRACTION_CONCURRENCY,
      run: async (extractionId) => {
        const response = await fetch(`/api/extractions/${extractionId}/run`, { method: 'POST' });
        return toQueueItemResult(response.status, await response.json().catch(() => null));
      },
      onUpdate: (extractionId, state: 'running' | QueueItemResult) => {
        if (state === 'running') {
          patchExtraction(extractionId, { status: 'running' });
          return;
        }
        patchExtraction(extractionId, {
          status: state.status,
          errorCode: state.errorCode,
          errorMessage: state.errorMessage,
        });
      },
    });
    setNotStarted(outcome.notStarted);
    setPhase(outcome.pausedBecauseUnavailable ? 'paused' : 'done');
    // The badge on «Bollette» counts the bills to review.
    router.refresh();
  }

  /** After a pause: the ones never started, then the ones the service turned away. */
  function resumeIds(): string[] {
    const failedUnavailable = rows
      .map((row) => row.extraction)
      .filter(
        (extraction): extraction is ExtractionState =>
          extraction !== null &&
          extraction.status === 'failed' &&
          extraction.errorCode === 'unavailable' &&
          !notStarted.includes(extraction.id),
      )
      .map((extraction) => extraction.id);
    if (phase === 'paused') return [...notStarted, ...failedUnavailable];
    // A batch reopened from «Lotti in sospeso»: everything resumable, in review order.
    return rows
      .map((row) => row.extraction)
      .filter(isResumable)
      .map((extraction) => extraction.id);
  }

  const extractions = rows.flatMap((row) => (row.extraction ? [row.extraction] : []));
  const ready = extractions.filter((extraction) => extraction.status === 'ready');
  const uploadsBusy = phase === 'uploading' || retrying > 0;
  const toResume = phase === 'paused' || (resuming && phase === 'ready') ? resumeIds() : [];
  const resumeCost = extractions
    .filter((extraction) => toResume.includes(extraction.id))
    .reduce((sum, extraction) => sum + extraction.estimatedCostMicroUsd, 0);
  const reviewHref = `/bollette/da-rivedere?lotto=${batchId}`;

  return (
    <div className="flex flex-col gap-5">
      {phase === 'choose' && (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor={`${id}-supply`} className={`${labelClass} mb-1`}>
              Fornitura
            </label>
            <select
              id={`${id}-supply`}
              className={inputClass}
              value={supplyId}
              onChange={(event) => setSupplyId(event.target.value)}
            >
              <option value="">Riconosci dalla bolletta</option>
              {supplies.map((supply) => (
                <option key={supply.id} value={supply.id}>
                  {supply.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-files`} className={`${labelClass} mb-1`}>
              File delle bollette
            </label>
            <input
              id={`${id}-files`}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              onChange={onFilesChosen}
              aria-describedby={`${id}-files-hint`}
              className="block w-full text-sm text-ink-soft file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-xs file:border-[1.5px] file:border-action file:bg-surface file:px-3.5 file:font-bold file:text-action hover:file:bg-surface-sunk"
            />
            <p id={`${id}-files-hint`} className="mt-1 text-sm text-ink-soft">
              Fino a 50 file: ogni PDF o foto è una bolletta intera. Le bollette fotografate in più
              pagine si caricano una alla volta da «Carica una bolletta».
            </p>
            {capMessage && (
              <p role="status" className="mt-1 text-sm font-semibold text-stamp">
                {capMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <ol className={panelClass}>
          {rows.map((row) => (
            <ImportRowItem
              key={row.key}
              row={row}
              canRemove={phase === 'choose'}
              canRetry={!uploadsBusy && !resuming && phase === 'ready'}
              onRemove={() => removeRow(row.key)}
              onRetry={() => onRetryUpload(row)}
            />
          ))}
        </ol>
      )}

      {phase === 'choose' && (
        <button
          type="button"
          className={buttonClass('primary', 'self-start')}
          disabled={rows.length === 0}
          onClick={onUpload}
        >
          Carica {rows.length} file
        </button>
      )}

      {phase === 'uploading' && (
        <p role="status" className="font-semibold">
          Caricamento dei file…
        </p>
      )}

      {phase === 'ready' && !resuming && !uploadsBusy && (
        <div data-testid="import-estimate" className={`${panelClass} flex flex-col gap-3 p-4`}>
          {ready.length === 0 ? (
            <p className="font-semibold">Nessuna bolletta da estrarre.</p>
          ) : (
            <>
              <p className="font-semibold">
                {ready.length} {ready.length === 1 ? 'bolletta pronta' : 'bollette pronte'} ·{' '}
                <span className="figures">
                  {ready.reduce((sum, extraction) => sum + extraction.pdfPages, 0)}
                </span>{' '}
                pagine PDF ·{' '}
                <span className="figures">
                  {ready.reduce((sum, extraction) => sum + extraction.photos, 0)}
                </span>{' '}
                foto · costo stimato circa{' '}
                <span className="figures">
                  {formatUsd(
                    ready.reduce((sum, extraction) => sum + extraction.estimatedCostMicroUsd, 0),
                  )}
                </span>
              </p>
              <button
                type="button"
                className={buttonClass('primary', 'self-start')}
                onClick={() => runExtractions(ready.map((extraction) => extraction.id))}
              >
                Avvia estrazione
              </button>
              <p className="text-sm text-ink-soft">
                Tieni aperta questa pagina: le estrazioni girano dal tuo browser.
              </p>
            </>
          )}
        </div>
      )}

      {(phase === 'paused' || (resuming && phase === 'ready')) && (
        <div data-testid="import-estimate" className={`${panelClass} flex flex-col gap-3 p-4`}>
          {phase === 'paused' && (
            <p role="alert" className="font-semibold text-danger">
              Anthropic non risponde: riprendi più tardi
            </p>
          )}
          {toResume.length === 0 ? (
            <>
              <p className="font-semibold">Niente da riprendere in questo lotto.</p>
              <Link href={reviewHref} className={buttonClass('secondary', 'self-start')}>
                Rivedi
              </Link>
            </>
          ) : (
            <>
              <p className="font-semibold">
                <span className="figures">{toResume.length}</span> in coda · costo stimato circa{' '}
                <span className="figures">{formatUsd(resumeCost)}</span>
              </p>
              <button
                type="button"
                className={buttonClass('primary', 'self-start')}
                onClick={() => runExtractions(toResume)}
              >
                Riprendi
              </button>
              <p className="text-sm text-ink-soft">
                Tieni aperta questa pagina: le estrazioni girano dal tuo browser.
              </p>
            </>
          )}
        </div>
      )}

      {phase === 'running' && (
        <p role="status" className="font-semibold">
          Estrazione in corso: tieni aperta questa pagina.
        </p>
      )}

      {phase === 'done' && (
        <div className={`${panelClass} flex flex-col gap-3 p-4`}>
          <p role="status" className="font-semibold">
            Estratte {extractions.filter((extraction) => extraction.status === 'extracted').length},
            fallite {extractions.filter((extraction) => extraction.status === 'failed').length}
          </p>
          <Link href={reviewHref} className={buttonClass('primary', 'self-start')}>
            Rivedi le bollette
          </Link>
        </div>
      )}
    </div>
  );
}

function rowStatus(row: Row): { text: string; tone: 'soft' | 'danger' | 'ink' } {
  const { extraction, upload } = row;
  if (extraction) {
    switch (extraction.status) {
      case 'ready':
        return { text: `pronta · ${extraction.fileLabel}`, tone: 'ink' };
      case 'queued':
        return { text: 'in coda', tone: 'soft' };
      case 'running':
        return { text: 'in corso', tone: 'soft' };
      case 'extracted':
        return { text: 'da rivedere', tone: 'ink' };
      case 'failed':
        return {
          text: `fallita: ${extraction.errorMessage ?? 'errore sconosciuto'}`,
          tone: 'danger',
        };
    }
  }
  switch (upload.kind) {
    case 'chosen':
      return { text: 'da caricare', tone: 'soft' };
    case 'uploading':
      return { text: 'caricamento…', tone: 'soft' };
    case 'duplicate':
      return { text: `doppione di ${upload.of}`, tone: 'soft' };
    case 'present':
      return { text: 'già presente', tone: 'soft' };
    case 'already-uploaded':
      return { text: 'già caricata', tone: 'soft' };
    case 'invalid':
      return { text: `file non valido: ${upload.message}`, tone: 'danger' };
    case 'not-uploaded':
      return { text: `non caricato: ${upload.message}`, tone: 'danger' };
    case 'done':
      return { text: '', tone: 'soft' };
  }
}

const TONE_CLASS = { soft: 'text-ink-soft', danger: 'text-danger', ink: 'text-ink' } as const;

function ImportRowItem({
  row,
  canRemove,
  canRetry,
  onRemove,
  onRetry,
}: {
  row: Row;
  canRemove: boolean;
  canRetry: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const status = rowStatus(row);
  const { upload } = row;
  return (
    <li
      data-testid="import-row"
      className="flex flex-col gap-1 border-b border-rule px-3 py-3 last:border-b-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 break-words font-semibold">{row.name}</span>
        {row.file && (
          <span className="figures text-sm text-ink-soft">{formatFileSize(row.file.size)}</span>
        )}
      </div>
      <p className={TONE_CLASS[status.tone]}>{status.text}</p>
      <div className="flex flex-wrap gap-2 empty:hidden">
        {canRemove && (
          <button type="button" className={buttonClass('quiet', 'text-sm')} onClick={onRemove}>
            Rimuovi<span className="sr-only"> {row.name}</span>
          </button>
        )}
        {upload.kind === 'present' && upload.billId && (
          <Link href={`/bollette/${upload.billId}`} className="text-sm">
            Apri la bolletta<span className="sr-only"> di {row.name}</span>
          </Link>
        )}
        {upload.kind === 'already-uploaded' && (
          <Link href="/bollette/da-rivedere" className="text-sm">
            Vai a «Da rivedere»
          </Link>
        )}
        {upload.kind === 'not-uploaded' && row.extraction === null && canRetry && (
          <button type="button" className={buttonClass('secondary', 'text-sm')} onClick={onRetry}>
            Riprova<span className="sr-only"> {row.name}</span>
          </button>
        )}
      </div>
    </li>
  );
}
