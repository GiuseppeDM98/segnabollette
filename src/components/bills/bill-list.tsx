import Link from 'next/link';
import { SupplyKindIcon } from '@/components/supplies/supply-kind-icon';
import { Stamp } from '@/components/ui/stamp';
import { columnHeaderClass } from '@/components/ui/styles';
import type { BillStatus, IsoDate, SupplyKind } from '@/lib/domain/types';
import { formatDate, formatEuro } from '@/lib/format';

export interface BillListRow {
  id: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  totalCents: number;
  isEstimated: boolean;
  status: BillStatus;
  supply?: { label: string; kind: SupplyKind };
}

const GRID = 'grid grid-cols-[6rem_minmax(0,1fr)_auto] gap-x-3';

/** Bills as passbook entries: period, what it is, the amount flush right, states as stamps. */
export function BillList({ bills }: { bills: BillListRow[] }) {
  if (bills.length === 0) return <p className="text-ink-soft">Nessuna bolletta.</p>;
  return (
    <div className="lg:max-w-3xl">
      <div className={`${GRID} ${columnHeaderClass} px-3 pb-1.5`} aria-hidden="true">
        <span>Periodo</span>
        <span>{bills[0]?.supply ? 'Fornitura' : ''}</span>
        <span className="text-right">Euro</span>
      </div>
      <ul className="border-x border-rule bg-surface">
        {bills.map((bill) => (
          <li key={bill.id} data-testid="bill-row" className="border-b border-rule">
            <Link
              href={`/bollette/${bill.id}`}
              className={`${GRID} px-3 py-3 text-ink no-underline hover:bg-surface-sunk`}
            >
              <span className="figures text-sm font-bold leading-snug">
                <span className="block text-xs font-normal text-ink-soft">
                  <span className="sr-only">Dal </span>
                  {formatDate(bill.periodStart)}
                </span>
                <span className="sr-only"> al </span>
                {formatDate(bill.periodEnd)}
              </span>
              <span className="flex min-w-0 flex-col items-start gap-1.5">
                {bill.supply && (
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    <SupplyKindIcon
                      kind={bill.supply.kind}
                      className="size-4 shrink-0 text-ink-soft"
                    />
                    <span className="truncate">{bill.supply.label}</span>
                  </span>
                )}
                <span className="flex flex-wrap gap-2">
                  {bill.isEstimated && <Stamp>stimata</Stamp>}
                  {bill.status === 'replaced' && <Stamp>sostituita</Stamp>}
                </span>
              </span>
              <span
                className={`figures text-right font-bold ${bill.status === 'replaced' ? 'text-ink-muted line-through' : ''}`}
              >
                {formatEuro(bill.totalCents)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
