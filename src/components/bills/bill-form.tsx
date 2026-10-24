'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useId, useMemo, useRef, useState } from 'react';
import { CheckboxField, describedBy, FormErrors } from '@/components/ui/field';
import {
  buttonClass,
  errorClass,
  figureInputClass,
  hintClass,
  inputClass,
  labelClass,
  panelClass,
} from '@/components/ui/styles';
import { checkBillArithmetic, type ExistingBillPeriod } from '@/lib/domain/bill-checks';
import type { BillInput } from '@/lib/domain/bill-input';
import {
  allowedRegisters,
  BANDS,
  consumptionUnitOf,
  isMetered,
  LINE_CATEGORIES,
  LINE_COMPONENTS,
  QUANTITY_UNITS,
  type SupplyKind,
} from '@/lib/domain/types';
import type { ActionResult } from '@/lib/errors';
import {
  CATEGORY_LABELS,
  COMPONENT_LABELS,
  formatDate,
  formatEuro,
  KIND_LABELS,
  REGISTER_LABELS,
  UNIT_LABELS,
} from '@/lib/format';
import { ArithmeticWarnings } from './arithmetic-warnings';
import {
  type BillDraft,
  type BillLineDraft,
  type BillReadingDraft,
  draftFigures,
  draftFromInput,
  inputFromDraft,
} from './bill-draft';

export interface BillFormProps {
  supply: { id: string; kind: SupplyKind; label: string; hasPhotovoltaic: boolean };
  initialValue: BillInput;
  /** A new hand-typed bill: line amounts and the bill total start empty and must be typed. */
  blankAmounts?: boolean;
  /** Bills already known to overlap (the review passes them; manual entry learns them on save). */
  overlaps?: ExistingBillPeriod[];
  submitLabel: string;
  /** nextPath: where to go after a successful save (default: the saved bill). */
  onSubmit: (input: BillInput) => Promise<ActionResult<{ billId: string; nextPath?: string }>>;
}

const SESSION_EXPIRED =
  "La sessione è scaduta: accedi di nuovo in un'altra scheda e poi premi di nuovo il pulsante";

const BAND_LABELS: Record<(typeof BANDS)[number], string> = {
  single: 'unica',
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F23: 'F23',
};

/** The bands as a bill prints them, F1 first; «unica» last, after the time bands. */
const BAND_OPTIONS = [...BANDS.filter((band) => band !== 'single'), 'single' as const];

/** Labels above the field on a phone; on the desktop table the column header names it. */
const CELL_LABEL = `${labelClass} mb-1 text-sm md:sr-only`;

function isOverlapList(value: unknown): value is ExistingBillPeriod[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null && 'periodStart' in item)
  );
}

export function BillForm({
  supply,
  initialValue,
  blankAmounts,
  overlaps: initialOverlaps,
  submitLabel,
  onSubmit,
}: BillFormProps) {
  const router = useRouter();
  const id = useId();
  const [draft, setDraft] = useState<BillDraft>(() =>
    draftFromInput(initialValue, { blankAmounts }),
  );
  // React keys for lines and readings, kept beside the draft so the draft stays a BillInput shape.
  const nextKey = useRef(0);
  const newKey = () => {
    nextKey.current += 1;
    return `k${nextKey.current}`;
  };
  const [lineKeys, setLineKeys] = useState(() => initialValue.lines.map(() => newKey()));
  const [readingKeys, setReadingKeys] = useState(() => initialValue.readings.map(() => newKey()));
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [overlaps, setOverlaps] = useState<ExistingBillPeriod[]>(initialOverlaps ?? []);
  const [formMessages, setFormMessages] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const overlapRef = useRef<HTMLFieldSetElement>(null);

  const { errors } = useMemo(() => inputFromDraft(draft), [draft]);
  const report = useMemo(() => checkBillArithmetic(draftFigures(draft)), [draft]);
  const figures = useMemo(() => draftFigures(draft), [draft]);

  const metered = isMetered(supply.kind);
  const consumptionUnit = isMetered(supply.kind) ? consumptionUnitOf(supply.kind) : null;
  const registers = allowedRegisters(supply.kind, supply.hasPhotovoltaic);
  const fieldId = (path: string) => `${id}-${path.replaceAll('.', '-')}`;
  const errorFor = (path: string) => (submitted || touched.has(path) ? errors[path] : undefined);
  const touch = (path: string) =>
    setTouched((current) => (current.has(path) ? current : new Set(current).add(path)));

  function update(patch: Partial<BillDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateLine(index: number, patch: Partial<BillLineDraft>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)),
    }));
  }

  function updateReading(index: number, patch: Partial<BillReadingDraft>) {
    setDraft((current) => ({
      ...current,
      readings: current.readings.map((reading, at) =>
        at === index ? { ...reading, ...patch } : reading,
      ),
    }));
  }

  function setEstimated(isEstimated: boolean) {
    setDraft((current) => ({
      ...current,
      isEstimated,
      lines: current.lines.map((line) =>
        line.category === 'commodity' && !line.isRecalculation ? { ...line, isEstimated } : line,
      ),
    }));
  }

  function addLine() {
    setDraft((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          description: '',
          category: 'other',
          component: 'lump',
          periodStart: current.periodStart,
          periodEnd: current.periodEnd,
          quantity: '',
          quantityUnit: null,
          unitPriceMicros: '',
          amountCents: '',
          band: null,
          isRecalculation: false,
          isEstimated: false,
          vatRateBp: '',
          hasOwnPeriod: false,
        },
      ],
    }));
    setLineKeys((keys) => [...keys, newKey()]);
  }

  function removeLine(index: number) {
    setDraft((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }));
    setLineKeys((keys) => keys.filter((_, at) => at !== index));
    // Error paths are by index: what was touched below the removed line now points elsewhere.
    setTouched(new Set());
  }

  function moveLine(index: number, delta: -1 | 1) {
    const swap = <T,>(items: T[]): T[] => {
      const next = [...items];
      const target = index + delta;
      const a = next[index];
      const b = next[target];
      if (a === undefined || b === undefined) return items;
      next[index] = b;
      next[target] = a;
      return next;
    };
    setDraft((current) => ({ ...current, lines: swap(current.lines) }));
    setLineKeys(swap);
    setTouched(new Set());
  }

  function addReading() {
    setDraft((current) => ({
      ...current,
      readings: [
        ...current.readings,
        {
          readOn: current.periodEnd,
          register: registers[0] ?? 'single',
          value: '',
          source: 'bill_actual',
        },
      ],
    }));
    setReadingKeys((keys) => [...keys, newKey()]);
  }

  function removeReading(index: number) {
    setDraft((current) => ({
      ...current,
      readings: current.readings.filter((_, at) => at !== index),
    }));
    setReadingKeys((keys) => keys.filter((_, at) => at !== index));
    setTouched(new Set());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitted(true);
    setFormMessages([]);
    const { input } = inputFromDraft(draft);
    if (!input) {
      // After the render that marks the fields: the first invalid one takes the focus.
      requestAnimationFrame(() => {
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    setPending(true);
    const result = await onSubmit({ ...input, supplyId: supply.id });
    if (result.ok) {
      router.push(result.data.nextPath ?? `/bollette/${result.data.billId}`);
      return;
    }
    setPending(false);
    if (result.code === 'OVERLAP_DECISION_REQUIRED' && isOverlapList(result.details)) {
      setOverlaps(result.details);
      requestAnimationFrame(() => overlapRef.current?.focus());
    } else if (result.code === 'UNAUTHORIZED') {
      setFormMessages([SESSION_EXPIRED]);
    } else if (
      result.code === 'VALIDATION' &&
      Array.isArray(result.details) &&
      result.details.length > 0
    ) {
      setFormMessages(result.details.map(String));
    } else {
      setFormMessages([result.message]);
    }
  }

  /** A text field of the draft: its label, the value, the error once touched or submitted. */
  function draftInput(options: {
    path: string;
    label: ReactNode;
    value: string;
    onChange: (value: string) => void;
    type?: 'text' | 'date';
    figure?: boolean;
    hint?: ReactNode;
    labelClassName?: string;
    required?: boolean;
    testId?: string;
  }) {
    const inputId = fieldId(options.path);
    const error = errorFor(options.path);
    return (
      <div>
        <label htmlFor={inputId} className={options.labelClassName ?? `${labelClass} mb-1`}>
          {options.label}
        </label>
        <input
          id={inputId}
          type={options.type ?? 'text'}
          inputMode={options.figure ? 'decimal' : undefined}
          value={options.value}
          onChange={(event) => options.onChange(event.target.value)}
          onBlur={() => touch(options.path)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, { hint: options.hint, error })}
          aria-required={options.required || undefined}
          data-testid={options.testId}
          className={options.figure ? figureInputClass : inputClass}
        />
        {options.hint && (
          <span id={`${inputId}-hint`} className={hintClass}>
            {options.hint}
          </span>
        )}
        {error && (
          <span id={`${inputId}-error`} className={errorClass} data-testid="field-error">
            {error}
          </span>
        )}
      </div>
    );
  }

  const usedCategories = LINE_CATEGORIES.filter((category) =>
    figures.lines.some((line) => line.category === category),
  );
  const decisionMissing = overlaps.length > 0 && draft.overlapDecision === null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6" data-testid="bill-form">
      <FormErrors messages={formMessages} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-base font-bold">Bolletta</legend>
        <p>
          <span className="text-ink-soft">Fornitura:</span>{' '}
          <span className="font-semibold">
            {supply.label} ({KIND_LABELS[supply.kind]})
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {draftInput({
            path: 'periodStart',
            label: 'Dal',
            type: 'date',
            value: draft.periodStart,
            onChange: (periodStart) => update({ periodStart }),
          })}
          {draftInput({
            path: 'periodEnd',
            label: 'Al',
            type: 'date',
            value: draft.periodEnd,
            onChange: (periodEnd) => update({ periodEnd }),
          })}
          {draftInput({
            path: 'issueDate',
            label: 'Emessa il',
            type: 'date',
            value: draft.issueDate ?? '',
            onChange: (value) => update({ issueDate: value === '' ? null : value }),
          })}
          {draftInput({
            path: 'dueDate',
            label: 'Scadenza',
            type: 'date',
            value: draft.dueDate ?? '',
            onChange: (value) => update({ dueDate: value === '' ? null : value }),
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {draftInput({
            path: 'supplierName',
            label: 'Fornitore',
            value: draft.supplierName ?? '',
            onChange: (supplierName) => update({ supplierName }),
          })}
          {draftInput({
            path: 'offerName',
            label: 'Offerta',
            value: draft.offerName ?? '',
            onChange: (offerName) => update({ offerName }),
          })}
        </div>
        {/* Every kind has it: a flat-fee bill marked estimated (by hand or by the extraction)
            must be clearable here, or its «stimata» stamp would stay for good. */}
        <CheckboxField
          id={fieldId('isEstimated')}
          label="Consumi stimati"
          checked={draft.isEstimated}
          onChange={setEstimated}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-base font-bold">Totali</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {draftInput({
            path: 'totalCents',
            label: 'Totale bolletta (€)',
            figure: true,
            required: true,
            value: draft.totalCents,
            onChange: (totalCents) => update({ totalCents }),
            testId: 'bill-total',
          })}
          {draftInput({
            path: 'amountDueCents',
            label: 'Totale da pagare (€)',
            figure: true,
            hint: 'se diverso: canone TV, saldi precedenti',
            value: draft.amountDueCents,
            onChange: (amountDueCents) => update({ amountDueCents }),
          })}
        </div>
      </fieldset>

      {supply.kind === 'gas' && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-base font-bold">Gas</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {draftInput({
              path: 'conversionFactor',
              label: 'Coefficiente C',
              figure: true,
              value: draft.conversionFactor,
              onChange: (conversionFactor) => update({ conversionFactor }),
            })}
            {draftInput({
              path: 'calorificValueGj',
              label: 'Potere calorifico superiore (GJ/Smc)',
              figure: true,
              hint: 'se la bolletta lo stampa in MJ/Smc, dividi per 1000',
              value: draft.calorificValueGj,
              onChange: (calorificValueGj) => update({ calorificValueGj }),
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 text-base font-bold">Voci</legend>
        <div className="md:overflow-x-auto">
          <table className="w-full border-collapse text-left max-md:block">
            <thead className="max-md:hidden">
              <tr className="border-b-2 border-action text-2xs font-bold uppercase tracking-widest text-action">
                <th scope="col" className="px-2 pb-1.5 font-bold">
                  N.
                </th>
                <th scope="col" className="px-2 pb-1.5 font-bold">
                  Descrizione
                </th>
                <th scope="col" className="px-2 pb-1.5 font-bold">
                  Categoria
                </th>
                <th scope="col" className="px-2 pb-1.5 font-bold">
                  Quantità
                </th>
                <th scope="col" className="px-2 pb-1.5 font-bold">
                  Unità
                </th>
                <th scope="col" className="px-2 pb-1.5 text-right font-bold">
                  Prezzo €
                </th>
                <th scope="col" className="px-2 pb-1.5 text-right font-bold">
                  Importo €
                </th>
              </tr>
            </thead>
            {draft.lines.map((line, index) => {
              const path = `lines.${index}`;
              const key = lineKeys[index] ?? `line-${index}`;
              const fixedUnit =
                consumptionUnit !== null &&
                line.category === 'commodity' &&
                line.quantityUnit === consumptionUnit;
              const unitId = fieldId(`${path}.quantityUnit`);
              const unitError = errorFor(`${path}.quantityUnit`);
              const categoryId = fieldId(`${path}.category`);
              const componentId = fieldId(`${path}.component`);
              const bandId = fieldId(`${path}.band`);
              return (
                <tbody
                  key={key}
                  data-testid="bill-line"
                  className="border-b border-rule bg-surface max-md:mb-3 max-md:block max-md:rounded-sm max-md:border"
                >
                  <tr className="align-top max-md:grid max-md:grid-cols-2 max-md:gap-3 max-md:p-3">
                    <td className="px-2 pt-3 max-md:col-span-2 max-md:block max-md:p-0">
                      <span className="figures font-bold">
                        <span className="md:sr-only">Voce </span>
                        {index + 1}
                      </span>
                    </td>
                    <td className="min-w-40 px-2 py-2 max-md:col-span-2 max-md:block max-md:p-0">
                      {draftInput({
                        path: `${path}.description`,
                        label: 'Descrizione',
                        labelClassName: CELL_LABEL,
                        value: line.description,
                        onChange: (description) => updateLine(index, { description }),
                      })}
                    </td>
                    <td className="min-w-36 px-2 py-2 max-md:col-span-2 max-md:block max-md:p-0">
                      <label htmlFor={categoryId} className={CELL_LABEL}>
                        Categoria
                      </label>
                      <select
                        id={categoryId}
                        value={line.category}
                        onChange={(event) =>
                          updateLine(index, {
                            category: event.target.value as BillLineDraft['category'],
                          })
                        }
                        className={inputClass}
                      >
                        {LINE_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-24 px-2 py-2 max-md:block max-md:w-auto max-md:p-0">
                      {draftInput({
                        path: `${path}.quantity`,
                        label: 'Quantità',
                        labelClassName: CELL_LABEL,
                        figure: true,
                        value: line.quantity,
                        onChange: (quantity) => updateLine(index, { quantity }),
                      })}
                    </td>
                    <td className="w-24 px-2 py-2 max-md:block max-md:w-auto max-md:p-0">
                      {fixedUnit ? (
                        <>
                          <span className={CELL_LABEL}>Unità</span>
                          <span className="flex min-h-11 items-center font-semibold">
                            {UNIT_LABELS[consumptionUnit]}
                          </span>
                        </>
                      ) : (
                        <>
                          <label htmlFor={unitId} className={CELL_LABEL}>
                            Unità
                          </label>
                          <select
                            id={unitId}
                            value={line.quantityUnit ?? ''}
                            onChange={(event) =>
                              updateLine(index, {
                                quantityUnit:
                                  event.target.value === ''
                                    ? null
                                    : (event.target.value as BillLineDraft['quantityUnit']),
                              })
                            }
                            onBlur={() => touch(`${path}.quantityUnit`)}
                            aria-invalid={unitError ? true : undefined}
                            aria-describedby={describedBy(unitId, { error: unitError })}
                            className={inputClass}
                          >
                            <option value="">—</option>
                            {QUANTITY_UNITS.map((unit) => (
                              <option key={unit} value={unit}>
                                {UNIT_LABELS[unit]}
                              </option>
                            ))}
                          </select>
                          {unitError && (
                            <span id={`${unitId}-error`} className={errorClass}>
                              {unitError}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="w-28 px-2 py-2 max-md:block max-md:w-auto max-md:p-0">
                      {draftInput({
                        path: `${path}.unitPriceMicros`,
                        label: 'Prezzo unitario (€)',
                        labelClassName: CELL_LABEL,
                        figure: true,
                        value: line.unitPriceMicros,
                        onChange: (unitPriceMicros) => updateLine(index, { unitPriceMicros }),
                      })}
                    </td>
                    <td className="w-28 px-2 py-2 max-md:block max-md:w-auto max-md:p-0">
                      {draftInput({
                        path: `${path}.amountCents`,
                        label: 'Importo (€)',
                        labelClassName: CELL_LABEL,
                        figure: true,
                        required: true,
                        value: line.amountCents,
                        onChange: (amountCents) => updateLine(index, { amountCents }),
                        testId: 'line-amount',
                      })}
                    </td>
                  </tr>
                  <tr className="max-md:block max-md:px-3 max-md:pb-3">
                    <td colSpan={7} className="px-2 pb-3 max-md:block max-md:p-0">
                      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                        <div className="w-40">
                          <label htmlFor={componentId} className={`${labelClass} mb-1 text-sm`}>
                            Componente
                          </label>
                          <select
                            id={componentId}
                            value={line.component}
                            onChange={(event) =>
                              updateLine(index, {
                                component: event.target.value as BillLineDraft['component'],
                              })
                            }
                            className={inputClass}
                          >
                            {LINE_COMPONENTS.map((component) => (
                              <option key={component} value={component}>
                                {COMPONENT_LABELS[component]}
                              </option>
                            ))}
                          </select>
                        </div>
                        {supply.kind === 'electricity' && (
                          <div className="w-28">
                            <label htmlFor={bandId} className={`${labelClass} mb-1 text-sm`}>
                              Fascia
                            </label>
                            <select
                              id={bandId}
                              value={line.band ?? ''}
                              onChange={(event) =>
                                updateLine(index, {
                                  band:
                                    event.target.value === ''
                                      ? null
                                      : (event.target.value as BillLineDraft['band']),
                                })
                              }
                              className={inputClass}
                            >
                              <option value="">—</option>
                              {BAND_OPTIONS.map((band) => (
                                <option key={band} value={band}>
                                  {BAND_LABELS[band]}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="w-24">
                          {draftInput({
                            path: `${path}.vatRateBp`,
                            label: 'IVA %',
                            labelClassName: `${labelClass} mb-1 text-sm`,
                            figure: true,
                            value: line.vatRateBp,
                            onChange: (vatRateBp) => updateLine(index, { vatRateBp }),
                          })}
                        </div>
                        <CheckboxField
                          id={fieldId(`${path}.isRecalculation`)}
                          label="Ricalcolo"
                          checked={line.isRecalculation}
                          onChange={(isRecalculation) => updateLine(index, { isRecalculation })}
                        />
                        <CheckboxField
                          id={fieldId(`${path}.isEstimated`)}
                          label="Stimata"
                          checked={line.isEstimated}
                          onChange={(isEstimated) => updateLine(index, { isEstimated })}
                        />
                        <CheckboxField
                          id={fieldId(`${path}.hasOwnPeriod`)}
                          label="Periodo diverso"
                          checked={line.hasOwnPeriod}
                          onChange={(hasOwnPeriod) =>
                            updateLine(
                              index,
                              hasOwnPeriod
                                ? {
                                    hasOwnPeriod,
                                    periodStart: draft.periodStart,
                                    periodEnd: draft.periodEnd,
                                  }
                                : { hasOwnPeriod },
                            )
                          }
                        />
                        {line.hasOwnPeriod && (
                          <div className="flex flex-wrap gap-3">
                            <div className="w-40">
                              {draftInput({
                                path: `${path}.periodStart`,
                                label: 'Voce dal',
                                labelClassName: `${labelClass} mb-1 text-sm`,
                                type: 'date',
                                value: line.periodStart,
                                onChange: (periodStart) => updateLine(index, { periodStart }),
                              })}
                            </div>
                            <div className="w-40">
                              {draftInput({
                                path: `${path}.periodEnd`,
                                label: 'Voce al',
                                labelClassName: `${labelClass} mb-1 text-sm`,
                                type: 'date',
                                value: line.periodEnd,
                                onChange: (periodEnd) => updateLine(index, { periodEnd }),
                              })}
                            </div>
                          </div>
                        )}
                        <div className="ml-auto flex gap-2">
                          <button
                            type="button"
                            onClick={() => moveLine(index, -1)}
                            disabled={index === 0}
                            aria-label={`Sposta su la voce ${index + 1}`}
                            className={buttonClass('quiet', 'text-sm')}
                          >
                            Su
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLine(index, 1)}
                            disabled={index === draft.lines.length - 1}
                            aria-label={`Sposta giù la voce ${index + 1}`}
                            className={buttonClass('quiet', 'text-sm')}
                          >
                            Giù
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLine(index)}
                            disabled={draft.lines.length === 1}
                            aria-label={`Rimuovi la voce ${index + 1}`}
                            className={buttonClass('quiet', 'text-sm text-danger')}
                          >
                            Rimuovi
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
        <button type="button" onClick={addLine} className={buttonClass('secondary', 'self-start')}>
          Aggiungi voce
        </button>
      </fieldset>

      <section
        aria-labelledby={`${id}-summary`}
        className={`${panelClass} flex flex-col gap-3 p-4`}
      >
        <h2 id={`${id}-summary`} className="text-base font-bold">
          Riepilogo
        </h2>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
          {usedCategories.map((category) => (
            <div key={category} className="contents">
              <dt className="text-ink-soft">{CATEGORY_LABELS[category]}</dt>
              <dd className="figures text-right font-bold">
                {formatEuro(
                  figures.lines
                    .filter((line) => line.category === category)
                    .reduce((sum, line) => sum + line.amountCents, 0),
                )}
              </dd>
            </div>
          ))}
          <dt className="mt-1 border-t border-rule pt-1 font-semibold">Totale calcolato</dt>
          <dd
            className="figures mt-1 border-t border-rule pt-1 text-right font-bold"
            data-testid="computed-total"
          >
            {formatEuro(report.linesTotalCents)}
          </dd>
        </dl>
        <ArithmeticWarnings report={report} figures={figures} />
      </section>

      {metered && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-base font-bold">Letture della bolletta</legend>
          {draft.readings.length === 0 && (
            <p className="text-ink-soft">Nessuna lettura stampata su questa bolletta.</p>
          )}
          {draft.readings.map((reading, index) => {
            const path = `readings.${index}`;
            const registerId = fieldId(`${path}.register`);
            const sourceId = fieldId(`${path}.source`);
            return (
              <div
                key={readingKeys[index] ?? `reading-${index}`}
                data-testid="bill-reading"
                className={`${panelClass} grid grid-cols-2 items-end gap-3 p-3 sm:grid-cols-[10rem_8rem_minmax(0,1fr)_9rem_auto]`}
              >
                {draftInput({
                  path: `${path}.readOn`,
                  label: 'Data',
                  type: 'date',
                  value: reading.readOn,
                  onChange: (readOn) => updateReading(index, { readOn }),
                })}
                <div>
                  <label htmlFor={registerId} className={`${labelClass} mb-1`}>
                    Registro
                  </label>
                  <select
                    id={registerId}
                    value={reading.register}
                    onChange={(event) =>
                      updateReading(index, {
                        register: event.target.value as BillReadingDraft['register'],
                      })
                    }
                    className={inputClass}
                  >
                    {registers.map((register) => (
                      <option key={register} value={register}>
                        {REGISTER_LABELS[register]}
                      </option>
                    ))}
                  </select>
                </div>
                {draftInput({
                  path: `${path}.value`,
                  label: 'Valore',
                  figure: true,
                  value: reading.value,
                  onChange: (value) => updateReading(index, { value }),
                })}
                <div>
                  <label htmlFor={sourceId} className={`${labelClass} mb-1`}>
                    Tipo
                  </label>
                  <select
                    id={sourceId}
                    value={reading.source}
                    onChange={(event) =>
                      updateReading(index, {
                        source: event.target.value as BillReadingDraft['source'],
                      })
                    }
                    className={inputClass}
                  >
                    <option value="bill_actual">Rilevata</option>
                    <option value="bill_estimated">Stimata</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeReading(index)}
                  aria-label={`Rimuovi la lettura ${index + 1}`}
                  className={buttonClass('quiet', 'text-sm text-danger')}
                >
                  Rimuovi
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addReading}
            className={buttonClass('secondary', 'self-start')}
          >
            Aggiungi lettura
          </button>
        </fieldset>
      )}

      {overlaps.length > 0 && (
        <fieldset
          ref={overlapRef}
          tabIndex={-1}
          data-testid="overlap-panel"
          className="flex flex-col gap-3 rounded-sm border border-stamp bg-stamp-wash p-4"
        >
          <legend className="sr-only">Sovrapposizione</legend>
          <p className="font-semibold">
            Questa bolletta copre giorni già coperti: scegli se sommarla o se sostituisce quella
            vecchia.
          </p>
          <ul className="flex flex-col gap-1">
            {overlaps.map((overlap) => (
              <li key={overlap.id}>
                <a
                  href={`/bollette/${overlap.id}`}
                  target="_blank"
                  rel="noopener"
                  className="font-semibold text-link"
                >
                  dal <span className="figures">{formatDate(overlap.periodStart)}</span> al{' '}
                  <span className="figures">{formatDate(overlap.periodEnd)}</span>
                </a>
              </li>
            ))}
          </ul>
          {(
            [
              ['sum', 'Si somma: è un conguaglio o una bolletta in più'],
              ['replace', 'Sostituisce quella vecchia'],
            ] as const
          ).map(([decision, label]) => (
            <label key={decision} className="flex min-h-11 cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name={`${id}-overlap`}
                value={decision}
                checked={draft.overlapDecision === decision}
                onChange={() => update({ overlapDecision: decision })}
                className="size-5 shrink-0"
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || decisionMissing}
          className={buttonClass('primary')}
        >
          {submitLabel}
        </button>
        {submitted && Object.keys(errors).length > 0 && (
          <p className="font-semibold text-danger" data-testid="form-has-errors">
            Correggi i campi segnati in rosso.
          </p>
        )}
      </div>
    </form>
  );
}
