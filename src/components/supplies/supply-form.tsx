'use client';

import { type FormEvent, useId, useState } from 'react';
import { CheckboxField, Field, FormErrors } from '@/components/ui/field';
import { buttonClass, inputClass } from '@/components/ui/styles';
import { SUPPLY_KINDS, type SupplyKind } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/errors';
import { IDENTIFIER_HINTS, KIND_LABELS } from '@/lib/format';
import { resultMessages } from '@/lib/parse-input';

export interface SupplyFormValues {
  houseId: string;
  kind: SupplyKind;
  label: string;
  supplierName: string | null;
  identifier: string | null;
  hasPhotovoltaic: boolean;
}

/**
 * New supply or edit of one. The kind is chosen once: an existing supply shows it as text, since
 * its bills follow the kind's lines. The house can move only when there is more than one.
 */
export function SupplyForm({
  houses,
  initial,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
}: {
  houses: Array<{ id: string; name: string }>;
  initial: SupplyFormValues & { isNew: boolean };
  submitLabel: string;
  onSubmit: (values: SupplyFormValues) => Promise<ActionResult<unknown>>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<SupplyFormValues>(initial);
  const [messages, setMessages] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  function setKind(kind: SupplyKind) {
    setValues((current) => ({
      ...current,
      kind,
      // The default name follows the kind until the person writes their own.
      label: current.label === KIND_LABELS[current.kind] ? KIND_LABELS[kind] : current.label,
      hasPhotovoltaic: kind === 'electricity' ? current.hasPhotovoltaic : false,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessages([]);
    const result = await onSubmit(values);
    setPending(false);
    if (!result.ok) {
      setMessages(resultMessages(result));
      return;
    }
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      data-testid="supply-form"
      className="flex flex-col gap-4 rounded-sm border border-rule bg-surface p-4"
    >
      <FormErrors messages={messages} />
      {initial.isNew ? (
        <Field id={`${id}-kind`} label="Tipo">
          <select
            id={`${id}-kind`}
            value={values.kind}
            onChange={(event) => setKind(event.target.value as SupplyKind)}
            className={inputClass}
          >
            {SUPPLY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p>
          <span className="font-semibold">Tipo:</span> {KIND_LABELS[values.kind]}
        </p>
      )}
      {houses.length > 1 && (
        <Field id={`${id}-house`} label="Casa">
          <select
            id={`${id}-house`}
            value={values.houseId}
            onChange={(event) => setValues({ ...values, houseId: event.target.value })}
            className={inputClass}
          >
            {houses.map((house) => (
              <option key={house.id} value={house.id}>
                {house.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id={`${id}-label`} label="Nome">
        <input
          id={`${id}-label`}
          value={values.label}
          onChange={(event) => setValues({ ...values, label: event.target.value })}
          required
          maxLength={60}
          className={inputClass}
        />
      </Field>
      <Field id={`${id}-supplier`} label="Fornitore">
        <input
          id={`${id}-supplier`}
          value={values.supplierName ?? ''}
          onChange={(event) => setValues({ ...values, supplierName: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field id={`${id}-identifier`} label="Identificativo" hint={IDENTIFIER_HINTS[values.kind]}>
        <input
          id={`${id}-identifier`}
          value={values.identifier ?? ''}
          onChange={(event) => setValues({ ...values, identifier: event.target.value })}
          aria-describedby={`${id}-identifier-hint`}
          autoCapitalize="characters"
          spellCheck={false}
          className={`${inputClass} figures`}
        />
      </Field>
      {values.kind === 'electricity' && (
        <CheckboxField
          id={`${id}-pv`}
          label="Impianto fotovoltaico"
          checked={values.hasPhotovoltaic}
          onChange={(checked) => setValues({ ...values, hasPhotovoltaic: checked })}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass('primary')}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('secondary')}>
          Annulla
        </button>
      </div>
    </form>
  );
}
