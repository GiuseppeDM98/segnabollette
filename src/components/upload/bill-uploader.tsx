'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';
import { discardExtractionAction } from '@/app/(app)/bollette/revisione/[id]/actions';
import { FormErrors } from '@/components/ui/field';
import {
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
  panelClass,
} from '@/components/ui/styles';
import { MAX_DOCUMENT_BYTES, MAX_PHOTO_BYTES } from '@/lib/blob/types';
import { uploadDocumentFile } from '@/lib/blob/upload-client';
import type { DocumentContentType, ExtractionErrorCode } from '@/lib/domain/types';
import { formatDate, formatFileSize, formatUsd } from '@/lib/format';
import { compressPhoto, UnsupportedPhotoError } from '@/lib/upload/compress-photo';
import { type ApiResult, apiMessages, postJson, requestRun } from './extraction-api';

const MAX_PHOTOS = 10;

export interface BillUploaderProps {
  /** extract: a new bill read by Claude; attach: files added to an existing bill. */
  mode: 'extract' | 'attach';
  billId?: string;
  /** extract: the supplies to choose from (none chosen = recognise it from the bill). */
  supplies?: Array<{ id: string; label: string }>;
  preselectedSupplyId?: string;
}

interface Photo {
  key: string;
  blob: Blob;
  url: string;
}

type Selection =
  | { kind: 'none' }
  | { kind: 'pdf'; file: File }
  | { kind: 'photos'; photos: Photo[] };

interface PlannedDocument {
  documentId: string;
  pathname: string;
  contentType: DocumentContentType;
}

interface DuplicateAnswer {
  duplicateOf: string;
  duplicateStatus: 'uploading' | 'queued' | 'running' | 'extracted' | 'failed';
  documents?: PlannedDocument[];
  estimatedCostMicroUsd?: number;
  errorCode?: ExtractionErrorCode | null;
  errorMessage?: string | null;
}

type CreateAnswer = { extractionId: string; documents: PlannedDocument[] } | DuplicateAnswer;

interface EstimateAnswer {
  estimatedCostMicroUsd: number;
}

type Phase =
  | { name: 'choose' }
  | { name: 'working'; message: string }
  | { name: 'estimate'; extractionId: string; costMicroUsd: number }
  | { name: 'running'; extractionId: string }
  | { name: 'failed'; extractionId: string; message: string; canRetry: boolean }
  | { name: 'busy' }
  | { name: 'duplicate-bill'; billId: string; periodStart: string | null; periodEnd: string | null }
  | { name: 'duplicate-review' };

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isBillDuplicate(
  details: unknown,
): details is { billId: string; periodStart: string | null; periodEnd: string | null } {
  return typeof details === 'object' && details !== null && 'billId' in details;
}

/**
 * Choose a PDF or photos, upload them straight to the private store, let the server verify them;
 * in extract mode then show the estimate and call Claude only at the click on «Estrai».
 */
export function BillUploader({
  mode,
  billId,
  supplies = [],
  preselectedSupplyId,
}: BillUploaderProps) {
  const router = useRouter();
  const id = useId();
  const [supplyId, setSupplyId] = useState(preselectedSupplyId ?? '');
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: 'choose' });
  const [done, setDone] = useState<string | null>(null);
  const photoUrls = useRef<string[]>([]);

  // Object URLs of the thumbnails are freed when the uploader goes away.
  useEffect(
    () => () => {
      for (const url of photoUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const files: Blob[] =
    selection.kind === 'pdf'
      ? [selection.file]
      : selection.kind === 'photos'
        ? selection.photos.map((photo) => photo.blob)
        : [];
  const busy = phase.name === 'working' || phase.name === 'running';

  function resetFiles() {
    if (selection.kind === 'photos') {
      for (const photo of selection.photos) URL.revokeObjectURL(photo.url);
    }
    setSelection({ kind: 'none' });
  }

  async function onFilesChosen(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (chosen.length === 0) return;
    setFieldError(null);
    setDone(null);
    const pdfs = chosen.filter((file) => file.type === 'application/pdf');
    if (pdfs.length > 0) {
      if (chosen.length > 1 || selection.kind === 'photos') {
        setFieldError('Un PDF va caricato da solo: scegli il PDF oppure le foto.');
        return;
      }
      const [pdf] = pdfs;
      if (!pdf) return;
      if (pdf.size > MAX_DOCUMENT_BYTES) {
        setFieldError('Il PDF supera i 10 MB.');
        return;
      }
      setSelection({ kind: 'pdf', file: pdf });
      return;
    }
    if (selection.kind === 'pdf') {
      setFieldError('Hai già scelto un PDF: toglilo per caricare le foto.');
      return;
    }
    const current = selection.kind === 'photos' ? selection.photos : [];
    if (current.length + chosen.length > MAX_PHOTOS) {
      setFieldError('Al massimo 10 foto per bolletta.');
      return;
    }
    const added: Photo[] = [];
    for (const file of chosen) {
      let blob: Blob;
      try {
        blob = await compressPhoto(file);
      } catch (error) {
        setFieldError(
          error instanceof UnsupportedPhotoError ? error.message : 'Foto non leggibile.',
        );
        return;
      }
      if (blob.size > MAX_PHOTO_BYTES) {
        setFieldError('Una foto supera i 5 MB anche dopo la compressione.');
        return;
      }
      const url = URL.createObjectURL(blob);
      photoUrls.current.push(url);
      added.push({ key: url, blob, url });
    }
    setSelection({ kind: 'photos', photos: [...current, ...added] });
  }

  function movePhoto(index: number, delta: number) {
    if (selection.kind !== 'photos') return;
    const photos = [...selection.photos];
    const target = index + delta;
    const [moved] = photos.splice(index, 1);
    if (!moved || target < 0 || target > photos.length) return;
    photos.splice(target, 0, moved);
    setSelection({ kind: 'photos', photos });
  }

  function removePhoto(index: number) {
    if (selection.kind !== 'photos') return;
    const photos = selection.photos.filter((_, position) => position !== index);
    const removed = selection.photos[index];
    if (removed) URL.revokeObjectURL(removed.url);
    setSelection(photos.length === 0 ? { kind: 'none' } : { kind: 'photos', photos });
  }

  function failWith(result: { message: string; details?: unknown }) {
    setErrors(apiMessages(result));
    setPhase({ name: 'choose' });
  }

  /** Every file in order to its pathname; false (with the message shown) on a failure. */
  async function uploadAll(documents: PlannedDocument[]): Promise<boolean> {
    try {
      for (const [index, document] of documents.entries()) {
        const file = files[index];
        if (!file) throw new Error('missing file');
        setPhase({
          name: 'working',
          message: `Caricamento del file ${index + 1} di ${documents.length}…`,
        });
        await uploadDocumentFile({
          file,
          pathname: document.pathname,
          documentId: document.documentId,
          contentType: document.contentType,
        });
      }
      return true;
    } catch {
      failWith({ message: 'Caricamento non riuscito: riprova con «Carica».' });
      return false;
    }
  }

  /** After the upload: the server verifies the files and answers with the estimate. */
  async function markUploaded(extractionId: string) {
    setPhase({ name: 'working', message: 'Controllo dei file…' });
    const result = await postJson<EstimateAnswer>(`/api/extractions/${extractionId}/uploaded`);
    if (result.ok) {
      setPhase({ name: 'estimate', extractionId, costMicroUsd: result.data.estimatedCostMicroUsd });
      router.refresh();
      return;
    }
    if (result.code === 'DOCUMENT_INVALID') {
      setPhase({ name: 'failed', extractionId, message: result.message, canRetry: false });
      router.refresh();
      return;
    }
    failWith(result);
  }

  async function onDuplicate(answer: DuplicateAnswer) {
    const { duplicateOf } = answer;
    switch (answer.duplicateStatus) {
      case 'extracted':
        router.push(`/bollette/revisione/${duplicateOf}`);
        return;
      case 'queued':
        setPhase({
          name: 'estimate',
          extractionId: duplicateOf,
          costMicroUsd: answer.estimatedCostMicroUsd ?? 0,
        });
        return;
      case 'failed':
        setPhase({
          name: 'failed',
          extractionId: duplicateOf,
          message: answer.errorMessage ?? 'Estrazione non riuscita.',
          canRetry: answer.errorCode !== 'document_invalid',
        });
        return;
      case 'running':
        setPhase({ name: 'busy' });
        return;
      case 'uploading':
        // The same interrupted upload: every file again on the same pathnames.
        if (await uploadAll(answer.documents ?? [])) await markUploaded(duplicateOf);
        return;
    }
  }

  async function onUpload() {
    if (files.length === 0) return;
    setErrors([]);
    setDone(null);
    setPhase({ name: 'working', message: 'Preparazione dei file…' });
    const declared = await Promise.all(
      files.map(async (file) => ({
        sha256: await sha256Hex(file),
        contentType: (selection.kind === 'pdf'
          ? 'application/pdf'
          : 'image/jpeg') as DocumentContentType,
        sizeBytes: file.size,
      })),
    );

    if (mode === 'attach') {
      await attach(declared);
      return;
    }

    const created: ApiResult<CreateAnswer> = await postJson<CreateAnswer>('/api/extractions', {
      supplyId: supplyId === '' ? null : supplyId,
      batchId: null,
      files: declared,
    });
    if (!created.ok) {
      if (created.code === 'DUPLICATE_DOCUMENT' && isBillDuplicate(created.details)) {
        setPhase({ name: 'duplicate-bill', ...created.details });
        return;
      }
      failWith(created);
      return;
    }
    if ('duplicateOf' in created.data) {
      await onDuplicate(created.data);
      return;
    }
    const { extractionId, documents } = created.data;
    if (await uploadAll(documents)) await markUploaded(extractionId);
  }

  async function attach(
    declared: Array<{ sha256: string; contentType: DocumentContentType; sizeBytes: number }>,
  ) {
    const created = await postJson<{ documents: PlannedDocument[] }>(
      `/api/bills/${billId}/documents`,
      { files: declared },
    );
    if (!created.ok) {
      if (created.code === 'DUPLICATE_DOCUMENT') {
        setPhase(
          isBillDuplicate(created.details)
            ? { name: 'duplicate-bill', ...created.details }
            : { name: 'duplicate-review' },
        );
        return;
      }
      failWith(created);
      return;
    }
    const { documents } = created.data;
    if (!(await uploadAll(documents))) return;
    setPhase({ name: 'working', message: 'Controllo dei file…' });
    const uploaded = await postJson<null>(`/api/bills/${billId}/documents/uploaded`, {
      documentIds: documents.map((document) => document.documentId),
    });
    if (!uploaded.ok) {
      failWith(uploaded);
      return;
    }
    resetFiles();
    setPhase({ name: 'choose' });
    setDone(documents.length === 1 ? 'File allegato.' : 'File allegati.');
    router.refresh();
  }

  async function onRun(extractionId: string) {
    setErrors([]);
    setPhase({ name: 'running', extractionId });
    const result = await requestRun(extractionId);
    router.refresh();
    if (!result.ok) {
      setErrors(apiMessages(result));
      setPhase({ name: 'failed', extractionId, message: result.message, canRetry: true });
      return;
    }
    if (result.data.status === 'extracted') {
      router.push(`/bollette/revisione/${extractionId}`);
      return;
    }
    setPhase({
      name: 'failed',
      extractionId,
      message: result.data.errorMessage ?? 'Estrazione non riuscita.',
      canRetry: result.data.errorCode !== 'document_invalid',
    });
  }

  async function onDiscard(extractionId: string) {
    setErrors([]);
    const result = await discardExtractionAction(extractionId);
    if (!result.ok) {
      setErrors(apiMessages(result));
      return;
    }
    resetFiles();
    setPhase({ name: 'choose' });
    router.refresh();
  }

  const manualHref = supplyId === '' ? '/bollette/nuova' : `/bollette/nuova?fornitura=${supplyId}`;
  const choosing = phase.name === 'choose' || phase.name === 'working';

  return (
    <div className="flex flex-col gap-4">
      <FormErrors messages={errors} />

      {choosing && (
        <>
          {mode === 'extract' && (
            <div>
              <label htmlFor={`${id}-supply`} className={`${labelClass} mb-1`}>
                Fornitura
              </label>
              <select
                id={`${id}-supply`}
                className={inputClass}
                value={supplyId}
                disabled={busy}
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
          )}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <span>
                <input
                  id={`${id}-files`}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                  multiple
                  disabled={busy}
                  onChange={onFilesChosen}
                  aria-describedby={fieldError ? `${id}-error` : undefined}
                  className="peer sr-only"
                />
                <label
                  htmlFor={`${id}-files`}
                  className={buttonClass(
                    'secondary',
                    'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-focus peer-focus-visible:outline-offset-2',
                  )}
                >
                  Scegli PDF o foto
                </label>
              </span>
              <span>
                <input
                  id={`${id}-camera`}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  onChange={onFilesChosen}
                  aria-describedby={fieldError ? `${id}-error` : undefined}
                  className="peer sr-only"
                />
                <label
                  htmlFor={`${id}-camera`}
                  className={buttonClass(
                    'secondary',
                    'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-focus peer-focus-visible:outline-offset-2',
                  )}
                >
                  Scatta foto
                </label>
              </span>
            </div>
            <p className="text-sm text-ink-soft">
              Un PDF fino a 10 MB, oppure fino a 10 foto delle pagine in ordine.
            </p>
            {fieldError && (
              <p id={`${id}-error`} role="alert" className={errorClass}>
                {fieldError}
              </p>
            )}
          </div>

          {selection.kind === 'pdf' && (
            <div
              className={`${panelClass} flex flex-wrap items-center justify-between gap-2 px-3 py-2`}
            >
              <span className="min-w-0 break-words">
                <span className="font-semibold">{selection.file.name}</span>{' '}
                <span className="text-sm text-ink-soft">{formatFileSize(selection.file.size)}</span>
              </span>
              <button
                type="button"
                className={buttonClass('quiet')}
                disabled={busy}
                onClick={resetFiles}
              >
                Rimuovi
              </button>
            </div>
          )}

          {selection.kind === 'photos' && (
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {selection.photos.map((photo, index) => (
                <li key={photo.key} className={`${panelClass} flex flex-col gap-2 p-2`}>
                  {/* biome-ignore lint/performance/noImgElement: a local object URL, nothing to optimise */}
                  <img
                    src={photo.url}
                    alt={`Pagina ${index + 1}`}
                    className="aspect-[3/4] w-full rounded-xs object-cover"
                  />
                  <span className="text-sm font-semibold">Pagina {index + 1}</span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={buttonClass('quiet')}
                      disabled={busy || index === 0}
                      onClick={() => movePhoto(index, -1)}
                    >
                      Su<span className="sr-only"> la pagina {index + 1}</span>
                    </button>
                    <button
                      type="button"
                      className={buttonClass('quiet')}
                      disabled={busy || index === selection.photos.length - 1}
                      onClick={() => movePhoto(index, 1)}
                    >
                      Giù<span className="sr-only"> la pagina {index + 1}</span>
                    </button>
                    <button
                      type="button"
                      className={buttonClass('quiet')}
                      disabled={busy}
                      onClick={() => removePhoto(index)}
                    >
                      Rimuovi<span className="sr-only"> la pagina {index + 1}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={buttonClass('primary')}
              disabled={busy || files.length === 0}
              onClick={onUpload}
            >
              {mode === 'attach' ? 'Allega il file' : 'Carica'}
            </button>
            <span role="status" className="text-sm text-ink-soft">
              {phase.name === 'working' ? phase.message : (done ?? '')}
            </span>
          </div>
        </>
      )}

      {phase.name === 'estimate' && (
        <div className={`${panelClass} flex flex-col gap-3 p-4`}>
          <p className="font-semibold">File caricati e controllati.</p>
          <p className="text-sm text-ink-soft">
            La bolletta resta in «Da rivedere» finché non la estrai.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass('primary')}
              onClick={() => onRun(phase.extractionId)}
            >
              Estrai (circa {formatUsd(phase.costMicroUsd)})
            </button>
            <button
              type="button"
              className={buttonClass('secondary')}
              onClick={() => onDiscard(phase.extractionId)}
            >
              Scarta
            </button>
          </div>
        </div>
      )}

      {phase.name === 'running' && (
        <p role="status" className={`${panelClass} p-4 font-semibold`}>
          Estrazione in corso…
        </p>
      )}

      {phase.name === 'failed' && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-sm border border-danger bg-danger-wash p-4"
        >
          <p className="font-semibold text-danger">{phase.message}</p>
          <div className="flex flex-wrap gap-2">
            {phase.canRetry && (
              <button
                type="button"
                className={buttonClass('primary')}
                onClick={() => onRun(phase.extractionId)}
              >
                Riprova
              </button>
            )}
            {phase.canRetry && (
              <Link href={manualHref} className={buttonClass('secondary')}>
                Inserisci a mano
              </Link>
            )}
            <button
              type="button"
              className={buttonClass('secondary')}
              onClick={() => onDiscard(phase.extractionId)}
            >
              Scarta
            </button>
          </div>
        </div>
      )}

      {phase.name === 'busy' && (
        <p role="status" className={`${panelClass} p-4`}>
          Questa bolletta è già in lavorazione.{' '}
          <Link href="/bollette/da-rivedere">Vai a «Da rivedere»</Link>
        </p>
      )}

      {phase.name === 'duplicate-bill' && (
        <div role="alert" className={`${panelClass} flex flex-col gap-2 p-4`}>
          <p className="font-semibold">
            {phase.periodStart && phase.periodEnd
              ? `Questo file è già nella bolletta dal ${formatDate(phase.periodStart)} al ${formatDate(phase.periodEnd)}.`
              : 'Questo file è già in una bolletta.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/bollette/${phase.billId}`} className={buttonClass('secondary')}>
              Apri la bolletta
            </Link>
            <button
              type="button"
              className={buttonClass('quiet')}
              onClick={() => {
                resetFiles();
                setPhase({ name: 'choose' });
              }}
            >
              Scegli un altro file
            </button>
          </div>
        </div>
      )}

      {phase.name === 'duplicate-review' && (
        <div role="alert" className={`${panelClass} flex flex-col gap-2 p-4`}>
          <p className="font-semibold">Questo file è già fra le bollette da rivedere.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/bollette/da-rivedere" className={buttonClass('secondary')}>
              Vai a «Da rivedere»
            </Link>
            <button
              type="button"
              className={buttonClass('quiet')}
              onClick={() => {
                resetFiles();
                setPhase({ name: 'choose' });
              }}
            >
              Scegli un altro file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
