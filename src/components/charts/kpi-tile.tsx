import { formatPercentChange } from '@/lib/format';

/**
 * One headline figure. `value` comes formatted (formatEuro, formatQuantity); `change` is the
 * percent change on the 12 months before: a number shows with its sign, null shows «—» (the two
 * periods are not comparable), absent shows no change line at all. `note` says what the figure
 * rests on («3,4 persone in media»).
 */
export function KpiTile({
  label,
  value,
  change,
  note,
}: {
  label: string;
  value: string;
  change?: number | null;
  note?: string;
}) {
  return (
    <div
      data-testid="kpi-tile"
      className="flex min-w-0 flex-col gap-1 rounded-sm border border-rule bg-surface px-3 py-2.5"
    >
      <p className="text-xs font-semibold text-ink-soft">{label}</p>
      <p className="figures text-lg font-bold">{value}</p>
      {note && <p className="text-xs text-ink-soft">{note}</p>}
      {change !== undefined && (
        <p className="text-xs text-ink-soft">
          <span className="figures font-bold text-ink">
            {change === null ? '—' : formatPercentChange(change)}
          </span>{' '}
          sui 12 mesi precedenti
        </p>
      )}
    </div>
  );
}
