'use client';

import { type FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { describedBy, Field, FormErrors } from '@/components/ui/field';
import {
  buttonClass,
  errorClass,
  figureInputClass,
  inputClass,
  labelClass,
} from '@/components/ui/styles';
import type { SelfReadingInput } from '@/lib/domain/bill-input';
import type { IsoDate, ReadingRegister } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/errors';
import {
  formatDate,
  formatQuantity,
  parseDecimalInput,
  REGISTER_LABELS,
  UNIT_LABELS,
} from '@/lib/format';
import { resultMessages } from '@/lib/parse-input';

type LastReadings = Partial<Record<ReadingRegister, { value: number; readOn: IsoDate }>>;

const NOT_A_NUMBER = 'Numero non valido';
const NO_VALUE = 'Scrivi almeno un valore.';

/**
 * A self reading: one field per register the supply counts, all on one day. A value below the
 * last reading of the same register is allowed (a new meter) but asks for confirmation.
 */
export function SelfReadingForm({
  supplies,
  initialSupplyId,
  today,
  registersBySupply,
  lastReadingsBySupply,
  onSubmit,
}: {
  supplies: Array<{ id: string; label: string; unit: 'kWh' | 'm3' }>;
  initialSupplyId: string | null;
  today: IsoDate;
  registersBySupply: Record<string, ReadingRegister[]>;
  lastReadingsBySupply: Record<string, LastReadings>;
  onSubmit: (input: SelfReadingInput) => Promise<ActionResult<{ readingIds: string[] }>>;
}) {
  const [supplyId, setSupplyId] = useState(initialSupplyId ?? supplies[0]?.id ?? '');
  const [readOn, setReadOn] = useState(today);
  const [values, setValues] = useState<Partial<Record<ReadingRegister, string>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ReadingRegister, string>>>({});
  const [messages, setMessages] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const supply = supplies.find((candidate) => candidate.id === supplyId);
  const registers = registersBySupply[supplyId] ?? [];
  const last = lastReadingsBySupply[supplyId] ?? {};

  /** The lower-value warning of a register, when its typed value is below the last reading. */
  function lowerThanLast(register: ReadingRegister): string | null {
    const previous = last[register];
    const value = parseDecimalInput(values[register] ?? '');
    if (!previous || value === null || !supply || value >= previous.value) return null;
    return `Il valore è più basso dell'ultima lettura (${formatQuantity(previous.value, supply.unit)} del ${formatDate(previous.readOn)}): è un contatore nuovo?`;
  }

  function chooseSupply(id: string) {
    setSupplyId(id);
    setValues({});
    setFieldErrors({});
    setMessages([]);
    setSaved(false);
  }

  /** The input to send, or null with the errors shown. */
  function buildInput(): SelfReadingInput | null {
    const errors: Partial<Record<ReadingRegister, string>> = {};
    const filled: SelfReadingInput['values'] = [];
    for (const register of registers) {
      const text = values[register] ?? '';
      if (text.trim() === '') continue;
      const value = parseDecimalInput(text);
      if (value === null) errors[register] = NOT_A_NUMBER;
      else filled.push({ register, value });
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return null;
    if (filled.length === 0) {
      setMessages([NO_VALUE]);
      return null;
    }
    return { supplyId, readOn, values: filled };
  }

  async function save(input: SelfReadingInput) {
    setPending(true);
    const result = await onSubmit(input);
    setPending(false);
    setConfirming(false);
    if (!result.ok) {
      setMessages(resultMessages(result));
      return;
    }
    setValues({});
    setSaved(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessages([]);
    setSaved(false);
    const input = buildInput();
    if (!input) return;
    if (registers.some((register) => lowerThanLast(register) !== null)) {
      setConfirming(true);
      return;
    }
    void save(input);
  }

  const warnings = registers.flatMap((register) => {
    const warning = lowerThanLast(register);
    return warning ? [{ register, warning }] : [];
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="self-reading-form"
      className="flex flex-col gap-4 rounded-sm border border-rule bg-surface p-4"
    >
      <h2 className="text-base font-bold">Nuova autolettura</h2>
      <FormErrors messages={messages} />
      {saved && (
        <p role="status" className="font-semibold text-action">
          Autolettura salvata.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="reading-supply" label="Fornitura">
          <select
            id="reading-supply"
            value={supplyId}
            onChange={(event) => chooseSupply(event.target.value)}
            className={inputClass}
          >
            {supplies.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="reading-date" label="Data">
          <input
            id="reading-date"
            type="date"
            value={readOn}
            max={today}
            onChange={(event) => setReadOn(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {registers.map((register) => {
          const id = `reading-${register}`;
          const error = fieldErrors[register];
          const warning = lowerThanLast(register);
          return (
            <div key={register}>
              <label htmlFor={id} className={`${labelClass} mb-1`}>
                {REGISTER_LABELS[register]}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={id}
                  inputMode="decimal"
                  value={values[register] ?? ''}
                  onChange={(event) => setValues({ ...values, [register]: event.target.value })}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    [describedBy(id, { error }), warning ? `${id}-warning` : null]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  className={figureInputClass}
                />
                {supply && (
                  <span className="shrink-0 text-sm text-ink-soft">{UNIT_LABELS[supply.unit]}</span>
                )}
              </div>
              {error && (
                <span id={`${id}-error`} className={errorClass} data-testid="field-error">
                  {error}
                </span>
              )}
              {warning && (
                <span
                  id={`${id}-warning`}
                  data-testid="lower-reading-warning"
                  className="mt-1 block rounded-xs bg-stamp-wash px-2 py-1 text-xs font-semibold text-stamp"
                >
                  {warning}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button type="submit" disabled={pending} className={buttonClass('primary', 'self-start')}>
        Salva
      </button>
      <ConfirmDialog
        open={confirming}
        title="Salvare comunque?"
        confirmLabel="Salva comunque"
        tone="primary"
        pending={pending}
        onConfirm={() => {
          const input = buildInput();
          if (input) void save(input);
        }}
        onCancel={() => setConfirming(false)}
      >
        <ul className="flex flex-col gap-1 text-stamp">
          {warnings.map(({ register, warning }) => (
            <li key={register} className="font-semibold">
              {REGISTER_LABELS[register]}: {warning}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </form>
  );
}
