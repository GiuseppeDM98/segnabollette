'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import {
  confirmExtractionAction,
  discardExtractionAction,
} from '@/app/(app)/bollette/revisione/[id]/actions';
import { BillForm } from '@/components/bills/bill-form';
import { CheckboxField, Field, FormErrors } from '@/components/ui/field';
import { buttonClass, inputClass, labelClass, panelClass } from '@/components/ui/styles';
import type { ExistingBillPeriod } from '@/lib/domain/bill-checks';
import type { BillInput } from '@/lib/domain/bill-input';
import { type DocumentContentType, SUPPLY_KINDS, type SupplyKind } from '@/lib/domain/types';
import type { ReviewDraft } from '@/lib/extraction/to-bill-input';
import { IDENTIFIER_HINTS, KIND_LABELS } from '@/lib/format';
import { resultMessages } from '@/lib/parse-input';

/** The value of «Crea una nuova fornitura» in the supply select; supply ids never look like it. */
const NEW_SUPPLY = 'nuova-fornitura';
/** BillInputSchema wants a non-empty supplyId; confirmExtraction puts the created supply's id there. */
const NEW_SUPPLY_PLACEHOLDER = 'nuova';

interface ReviewSupply {
  id: string;
  kind: SupplyKind;
  label: string;
  hasPhotovoltaic: boolean;
}

export interface ExtractionReviewProps {
  extractionId: string;
  documents: Array<{ id: string; contentType: DocumentContentType }>;
  draft: ReviewDraft;
  supplies: ReviewSupply[];
  houses: Array<{ id: string; name: string }>;
  overlaps: ExistingBillPeriod[];
}

/** The bill as Claude read it, next to the document, to be checked and confirmed. */
export function ExtractionReview({
  extractionId,
  documents,
  draft,
  supplies,
  houses,
  overlaps,
}: ExtractionReviewProps) {
  const router = useRouter();
  const id = useId();
  const matched = supplies.find((supply) => supply.id === draft.matchedSupplyId) ?? null;
  const suggested = draft.suggestedSupply;
  const [choice, setChoice] = useState(matched?.id ?? '');
  const [houseId, setHouseId] = useState(houses[0]?.id ?? '');
  const [kind, setKind] = useState<SupplyKind | ''>(suggested?.kind ?? '');
  const [label, setLabel] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState(suggested?.supplierName ?? '');
  const [identifier, setIdentifier] = useState(suggested?.identifier ?? '');
  const [hasPhotovoltaic, setHasPhotovoltaic] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const isNew = choice === NEW_SUPPLY;
  const newLabel = label ?? (kind === '' ? '' : KIND_LABELS[kind]);
  // The extracted kind first: the bill most likely belongs to one of those.
  const choices = matched
    ? []
    : [...supplies].sort(
        (a, b) => Number(b.kind === suggested?.kind) - Number(a.kind === suggested?.kind),
      );

  let formSupply: ReviewSupply | null = null;
  if (isNew && kind !== '') {
    formSupply = {
      id: NEW_SUPPLY_PLACEHOLDER,
      kind,
      label: newLabel,
      hasPhotovoltaic: kind === 'electricity' && hasPhotovoltaic,
    };
  } else if (!isNew) {
    formSupply = supplies.find((supply) => supply.id === choice) ?? null;
  }

  async function onSubmit(input: BillInput) {
    const newSupply =
      isNew && kind !== ''
        ? {
            houseId,
            kind,
            label: newLabel,
            supplierName: supplierName.trim() === '' ? null : supplierName,
            identifier: identifier.trim() === '' ? null : identifier,
            hasPhotovoltaic: kind === 'electricity' && hasPhotovoltaic,
          }
        : null;
    return confirmExtractionAction({ extractionId, input, newSupply });
  }

  async function onDiscard() {
    setErrors([]);
    const result = await discardExtractionAction(extractionId);
    if (!result.ok) {
      setErrors(resultMessages(result));
      return;
    }
    router.push('/bollette/da-rivedere');
  }

  const [pdf] = documents.filter((document) => document.contentType === 'application/pdf');
  const photos = documents.filter((document) => document.contentType === 'image/jpeg');

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
      {/* From 1024 px the document sits beside the form; lazy, so a hidden one is never fetched. */}
      <div className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-2">
        {pdf ? (
          <>
            <iframe
              src={`/api/documents/${pdf.id}`}
              title="La bolletta caricata"
              loading="lazy"
              className={`${panelClass} h-[80dvh] w-full`}
            />
            <a href={`/api/documents/${pdf.id}`} target="_blank" rel="noopener">
              Apri in una nuova scheda
            </a>
          </>
        ) : (
          // Focusable: a region that scrolls must be reachable from the keyboard.
          <section
            aria-label="Foto della bolletta"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users scroll the photos
            tabIndex={0}
            className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto"
          >
            {photos.map((photo, index) => (
              // biome-ignore lint/performance/noImgElement: a private file behind the session, no optimiser
              <img
                key={photo.id}
                src={`/api/documents/${photo.id}`}
                alt={`Pagina ${index + 1} della bolletta`}
                loading="lazy"
                className={`${panelClass} w-full`}
              />
            ))}
          </section>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="lg:hidden">
          {pdf ? (
            <a
              href={`/api/documents/${pdf.id}`}
              target="_blank"
              rel="noopener"
              className={buttonClass('secondary')}
            >
              Apri il PDF
            </a>
          ) : (
            <details className={panelClass}>
              <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-semibold">
                Foto della bolletta ({photos.length})
              </summary>
              <div className="flex flex-col gap-3 p-3">
                {photos.map((photo, index) => (
                  // biome-ignore lint/performance/noImgElement: a private file behind the session, no optimiser
                  <img
                    key={photo.id}
                    src={`/api/documents/${photo.id}`}
                    alt={`Pagina ${index + 1} della bolletta`}
                    loading="lazy"
                    className="w-full rounded-xs"
                  />
                ))}
              </div>
            </details>
          )}
        </div>

        {draft.warnings.length > 0 && (
          <div
            data-testid="extraction-warnings"
            className="rounded-sm border border-stamp bg-stamp-wash px-3 py-2 font-semibold text-stamp"
          >
            <p>Da controllare:</p>
            <ul className="list-disc pl-5">
              {draft.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <FormErrors messages={errors} />

        {/* A recognised supply needs no choice: BillForm names it at the top. */}
        {!matched && (
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor={`${id}-choice`} className={`${labelClass} mb-1`}>
                A quale fornitura appartiene?
              </label>
              <select
                id={`${id}-choice`}
                className={inputClass}
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
              >
                <option value="">Scegli…</option>
                {choices.map((supply) => (
                  <option key={supply.id} value={supply.id}>
                    {supply.label} ({KIND_LABELS[supply.kind]})
                  </option>
                ))}
                <option value={NEW_SUPPLY}>Crea una nuova fornitura</option>
              </select>
            </div>

            {isNew && (
              <fieldset className={`${panelClass} flex flex-col gap-3 p-4`}>
                <legend className="px-1 font-bold">Nuova fornitura</legend>
                <Field id={`${id}-house`} label="Casa">
                  <select
                    id={`${id}-house`}
                    className={inputClass}
                    value={houseId}
                    onChange={(event) => setHouseId(event.target.value)}
                  >
                    {houses.map((house) => (
                      <option key={house.id} value={house.id}>
                        {house.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`${id}-kind`} label="Tipo">
                  <select
                    id={`${id}-kind`}
                    className={inputClass}
                    value={kind}
                    required
                    onChange={(event) => setKind(event.target.value as SupplyKind | '')}
                  >
                    <option value="">Scegli il tipo…</option>
                    {SUPPLY_KINDS.map((option) => (
                      <option key={option} value={option}>
                        {KIND_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`${id}-label`} label="Nome">
                  <input
                    id={`${id}-label`}
                    className={inputClass}
                    value={newLabel}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </Field>
                <Field id={`${id}-supplier`} label="Fornitore">
                  <input
                    id={`${id}-supplier`}
                    className={inputClass}
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                  />
                </Field>
                <Field
                  id={`${id}-identifier`}
                  label="Identificativo"
                  hint={kind === '' ? undefined : IDENTIFIER_HINTS[kind]}
                >
                  <input
                    id={`${id}-identifier`}
                    className={inputClass}
                    value={identifier}
                    aria-describedby={kind === '' ? undefined : `${id}-identifier-hint`}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                </Field>
                {kind === 'electricity' && (
                  <CheckboxField
                    id={`${id}-pv`}
                    label="Fotovoltaico"
                    checked={hasPhotovoltaic}
                    onChange={setHasPhotovoltaic}
                  />
                )}
              </fieldset>
            )}
          </div>
        )}

        {formSupply ? (
          <BillForm
            key={isNew ? `new-${formSupply.kind}` : formSupply.id}
            supply={formSupply}
            initialValue={{ ...draft.input, supplyId: formSupply.id }}
            overlaps={formSupply.id === draft.matchedSupplyId ? overlaps : undefined}
            submitLabel="Conferma"
            onSubmit={onSubmit}
          />
        ) : (
          <p className="text-ink-soft">
            {isNew
              ? 'Scegli il tipo della fornitura per vedere le voci.'
              : 'Scegli la fornitura per vedere le voci.'}
          </p>
        )}

        <button
          type="button"
          className={buttonClass('danger-outline', 'self-start')}
          onClick={onDiscard}
        >
          Scarta
        </button>
      </div>
    </div>
  );
}
