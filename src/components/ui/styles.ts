/**
 * The class strings of the shared controls, so a link and a button that do the same job look the
 * same. Values come from DESIGN.md: square 2 px corners, 44 px touch targets, tokens only.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'quiet';

const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xs px-3.5 font-bold ' +
  'no-underline disabled:cursor-not-allowed disabled:opacity-60';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-action text-on-action hover:bg-action-hover',
  secondary: 'border-[1.5px] border-action bg-surface text-action hover:bg-surface-sunk',
  danger: 'bg-danger text-on-danger',
  'danger-outline': 'border-[1.5px] border-danger bg-surface text-danger hover:bg-danger-wash',
  quiet: 'min-w-11 px-2 text-action underline hover:bg-surface-sunk',
};

export function buttonClass(variant: ButtonVariant = 'primary', extra = ''): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${extra}`.trim();
}

/** Text, number, date and select fields: paper ground, strong rule, 16 px text. */
export const inputClass =
  'block min-h-11 w-full rounded-xs border border-rule-strong bg-surface px-3 py-2 font-normal text-ink ' +
  'aria-invalid:border-danger disabled:bg-surface-sunk';

/** A field that holds a figure: amounts, quantities, prices, readings. */
export const figureInputClass = `${inputClass} figures text-right`;

export const labelClass = 'block font-semibold';

/** The small helper line under a field. */
export const hintClass = 'mt-1 block text-xs text-ink-muted';

/** The message under a field that failed validation. */
export const errorClass = 'mt-1 block text-xs font-semibold text-danger';

/** A page section on paper: clean leaf with hairline rules. */
export const panelClass = 'rounded-sm border border-rule bg-surface';

/** The passbook's column header: label type over the one heavier rule. */
export const columnHeaderClass =
  'border-b-2 border-action text-2xs font-bold uppercase tracking-widest text-action';
