'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import { buttonClass } from './styles';

/**
 * The app's own confirmation, on a native modal <dialog> (focus trapped, Escape cancels) rather
 * than window.confirm, so it can say what a delete removes and look like the rest of the app.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Annulla',
  tone = 'danger',
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-sm border border-rule-strong bg-surface p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        {children}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className={buttonClass('secondary')}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={buttonClass(tone === 'danger' ? 'danger' : 'primary')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
