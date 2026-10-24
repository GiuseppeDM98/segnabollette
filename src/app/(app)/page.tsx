import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CostsChart } from '@/components/charts/costs-chart';
import { KpiTile } from '@/components/charts/kpi-tile';
import { PeriodSelector } from '@/components/charts/period-selector';
import { HouseSelect } from '@/components/houses/house-select';
import { SupplyKindIcon } from '@/components/supplies/supply-kind-icon';
import { Stamp } from '@/components/ui/stamp';
import { buttonClass, columnHeaderClass } from '@/components/ui/styles';
import { percentChange, toHouseCostSeries } from '@/lib/charts/series';
import { getDb } from '@/lib/container';
import type { SupplyRow } from '@/lib/db/repositories/supplies';
import { romeToday, shiftMonth } from '@/lib/domain/dates';
import { consumptionUnitOf, isMetered } from '@/lib/domain/types';
import type { SupplyMonth } from '@/lib/engine';
import {
  formatDate,
  formatEuro,
  formatMonth,
  formatQuantity,
  formatUnitPrice,
  KIND_LABELS,
} from '@/lib/format';
import { listLatestBills } from '@/lib/services/bills';
import { getHouseDashboard, type HouseDashboard } from '@/lib/services/dashboard';
import { listHousesWithSupplies } from '@/lib/services/houses-supplies';
import { dashboardRange, orNotFound, PERIOD_QUERIES, pageUser, queryValue } from './page-helpers';

/** The entry grid: dates, what it is, the amount flush right. The header uses the same columns. */
const ENTRY_GRID = 'grid grid-cols-[6rem_minmax(0,1fr)_auto] gap-x-3';

/** The two house tiles, over the window ending at the oldest last billed month of its supplies. */
function HouseTiles({ dashboard }: { dashboard: HouseDashboard }) {
  const { houseEndMonth, rolling, averageMonthlyCents } = dashboard;
  return (
    <div className="flex flex-col gap-2">
      {houseEndMonth && (
        <p className="text-sm text-ink-soft">
          Ultimi 12 mesi fatturati:{' '}
          <span className="figures font-bold text-ink">
            {formatMonth(shiftMonth(houseEndMonth, -11))} – {formatMonth(houseEndMonth)}
          </span>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiTile
          label="Spesa degli ultimi 12 mesi"
          value={rolling ? formatEuro(rolling.last12) : '—'}
          change={rolling?.isComparable ? percentChange(rolling.last12, rolling.previous12) : null}
        />
        <KpiTile
          label="Spesa media mensile"
          value={averageMonthlyCents === null ? '—' : formatEuro(averageMonthlyCents)}
        />
      </div>
    </div>
  );
}

/** The card's line about the last billed month: consumption and unit price, or the flat fee. */
function LastBilledLine({ supply, month }: { supply: SupplyRow; month: SupplyMonth | null }) {
  if (!month) return <p className="text-xs text-ink-muted">Nessun mese fatturato</p>;
  let figures: string[];
  if (isMetered(supply.kind)) {
    const unit = consumptionUnitOf(supply.kind);
    figures = [
      month.consumption === null ? '—' : formatQuantity(month.consumption, unit),
      month.totalUnitPriceMicros === null ? '—' : formatUnitPrice(month.totalUnitPriceMicros, unit),
    ];
  } else {
    figures = [formatEuro(month.totalCents)];
  }
  return (
    <p className="text-xs text-ink-soft" data-testid="supply-last-month">
      <span className="sr-only">Ultimo mese fatturato: </span>
      <span className="figures">{[formatMonth(month.month), ...figures].join(' · ')}</span>
    </p>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ casa?: string | string[]; periodo?: string | string[] }>;
}) {
  const user = await pageUser();
  const query = await searchParams;
  const houseId = queryValue(query.casa);
  const range = dashboardRange(query.periodo);
  const houses = await listHousesWithSupplies(getDb(), user.id, { includeArchived: false });

  if (houses.length === 0) {
    if (houseId !== undefined) notFound();
    return (
      <div className="flex flex-col gap-4 px-4 pt-10">
        <h1 className="text-lg font-bold">Comincia creando la tua casa</h1>
        <p className="max-w-prose text-ink-soft">
          Una casa raccoglie le forniture (luce, gas, acqua, internet, TARI) e le loro bollette.
        </p>
        <Link href="/forniture" className={buttonClass('primary', 'self-start')}>
          Crea la casa
        </Link>
      </div>
    );
  }

  // Someone else's or an unknown house is refused here, by the dashboard service: a 404.
  const dashboard = await orNotFound(
    getHouseDashboard(getDb(), user.id, houseId ?? houses[0]?.house.id ?? '', {
      today: romeToday(Date.now()),
      range,
    }),
  );
  const { house } = dashboard;
  // The cards follow the order of «Forniture», active supplies only.
  const supplies = houses.find((entry) => entry.house.id === house.id)?.supplies ?? [];
  const latest = await listLatestBills(
    getDb(),
    user.id,
    supplies.map((supply) => supply.id),
  );
  const lastBilledById = new Map(
    dashboard.supplies.map((entry) => [entry.supply.id, entry.lastBilled]),
  );
  const hasBilledMonth = dashboard.supplies.some((entry) => entry.lastBilledMonth !== null);
  const casaQuery = houseId === undefined ? '' : `casa=${encodeURIComponent(houseId)}&`;

  return (
    <div className="pb-10">
      <div className="cloth px-4 pt-6 pb-4">
        {houses.length > 1 ? (
          <>
            <h1 className="sr-only">{house.name}</h1>
            <HouseSelect
              houses={houses.map((entry) => ({ id: entry.house.id, name: entry.house.name }))}
              selectedId={house.id}
              periodo={query.periodo === undefined ? undefined : PERIOD_QUERIES[range]}
            />
          </>
        ) : (
          <h1 className="py-1 text-2xl font-extrabold">{house.name}</h1>
        )}
      </div>

      <div className="mx-4 mt-4 flex flex-col gap-4 lg:max-w-3xl">
        <PeriodSelector
          current={range}
          hrefFor={(option) => `/?${casaQuery}periodo=${PERIOD_QUERIES[option]}`}
        />
        <HouseTiles dashboard={dashboard} />
        {hasBilledMonth ? (
          <CostsChart points={toHouseCostSeries(dashboard.houseMonths)} mode="house" />
        ) : (
          <p className="text-ink-soft">Ancora nessuna bolletta in questa casa</p>
        )}
      </div>

      {supplies.length === 0 ? (
        <div className="flex flex-col gap-3 px-4 pt-6">
          <p className="text-ink-soft">Questa casa non ha forniture attive.</p>
          <Link href="/forniture" className={buttonClass('secondary', 'self-start')}>
            Aggiungi una fornitura
          </Link>
        </div>
      ) : (
        <>
          <div
            className={`${ENTRY_GRID} ${columnHeaderClass} mx-4 mt-6 pb-1.5 lg:max-w-3xl`}
            aria-hidden="true"
          >
            <span>Data</span>
            <span>Fornitura</span>
            <span className="text-right">Euro</span>
          </div>
          <ul className="mx-4 border-x border-rule bg-surface lg:max-w-3xl">
            {supplies.map((supply) => {
              const bill = latest[supply.id] ?? null;
              return (
                <li
                  key={supply.id}
                  data-testid="supply-card"
                  className="border-b border-rule px-3 py-3"
                >
                  <div className={ENTRY_GRID}>
                    <p className="figures text-sm font-bold leading-snug">
                      {bill ? (
                        <>
                          <span className="block text-xs font-normal text-ink-soft">
                            <span className="sr-only">Ultima bolletta dal </span>
                            {formatDate(bill.periodStart)}
                          </span>
                          <span className="sr-only"> al </span>
                          {formatDate(bill.periodEnd)}
                        </>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </p>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <SupplyKindIcon
                          kind={supply.kind}
                          className="size-4 shrink-0 text-ink-soft"
                        />
                        <Link
                          href={`/forniture/${supply.id}`}
                          className="truncate text-ink no-underline hover:underline"
                        >
                          {supply.label}
                        </Link>
                      </p>
                      <p className="truncate text-xs text-ink-soft">
                        {KIND_LABELS[supply.kind]}
                        {supply.supplierName ? ` · ${supply.supplierName}` : ''}
                      </p>
                      {!bill && <p className="text-xs text-ink-muted">Nessuna bolletta</p>}
                      <LastBilledLine
                        supply={supply}
                        month={lastBilledById.get(supply.id) ?? null}
                      />
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <p className="figures font-bold">
                        {bill ? (
                          <Link
                            href={`/bollette/${bill.id}`}
                            className="text-ink no-underline hover:underline"
                          >
                            {formatEuro(bill.totalCents)}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </p>
                      {bill?.isEstimated && <Stamp>stimata</Stamp>}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2 sm:pl-[6.75rem]">
                    <Link
                      href={`/bollette/nuova?fornitura=${supply.id}`}
                      className={buttonClass('secondary', 'text-sm')}
                    >
                      Nuova bolletta
                    </Link>
                    {isMetered(supply.kind) && (
                      <Link
                        href={`/letture?fornitura=${supply.id}`}
                        className={buttonClass('secondary', 'text-sm')}
                      >
                        Autolettura
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
