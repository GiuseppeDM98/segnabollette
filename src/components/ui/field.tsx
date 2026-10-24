import type { ReactNode } from 'react';
import { errorClass, hintClass, labelClass } from './styles';

/** The ids a control points at with aria-describedby: its hint and its error, when shown. */
export function describedBy(id: string, parts: { hint?: unknown; error?: unknown }) {
  const ids = [parts.hint ? `${id}-hint` : null, parts.error ? `${id}-error` : null];
  return ids.filter(Boolean).join(' ') || undefined;
}

/**
 * A label above its control, with an optional hint and error under it. The control itself is the
 * child: it must carry `id`, `aria-describedby={describedBy(id, …)}` and `aria-invalid`.
 */
export function Field({
  id,
  label,
  hint,
  error,
  labelClassName = labelClass,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={`${labelClassName} mb-1`}>
        {label}
      </label>
      {children}
      {hint && (
        <span id={`${id}-hint`} className={hintClass}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={errorClass} data-testid="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

/** A checkbox with its label to the right, at touch size. */
export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  name,
}: {
  id: string;
  label: ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  name?: string;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2.5">
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
        className="size-5 shrink-0"
      />
      <span>{label}</span>
    </label>
  );
}

/** Errors that belong to the whole form (server answers), as a list at its top. */
export function FormErrors({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="form-errors"
      className="rounded-sm border border-danger bg-danger-wash px-3 py-2 text-danger"
    >
      {messages.length === 1 ? (
        <p className="font-semibold">{messages[0]}</p>
      ) : (
        <ul className="list-disc pl-5 font-semibold">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
