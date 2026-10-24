import Link from 'next/link';
import { BillList } from '@/components/bills/bill-list';
import { ConsumptionChart } from '@/components/charts/consumption-chart';
import { CostsChart } from '@/components/charts/costs-chart';
import { PeriodSelector } from '@/components/charts/period-selector';
import { UnitPriceChart } from '@/components/charts/unit-price-chart';
import { YearOverYearChart } from '@/components/charts/year-over-year-chart';
import { ReadingTable } from '@/components/readings/reading-table';
import { SupplyActions } from '@/components/supplies/supply-actions';
import { SupplyKindIcon } from '@/components/supplies/supply-kind-icon';
import { Page, Section } from '@/components/ui/page';
import { Stamp } from '@/components/ui/stamp';
import { buttonClass, panelClass } from '@/components/ui/styles';
import {
  toConsumptionSeries,
  toCostSeries,
  toUnitPriceSeries,
  toYearOverYearSeries,
} from '@/lib/charts/series';
import { getDb } from '@/lib/container';
import { monthKeyOf, romeToday } from '@/lib/domain/dates';
import { consumptionUnitOf, isMetered, readingUnitOf } from '@/lib/domain/types';
import { KIND_LABELS } from '@/lib/format';
import { listBills } from '@/lib/services/bills';
import { getSupplyDashboard, type SupplyDashboard } from '@/lib/services/dashboard';
import {
  getDeletionSummary,
  getSupplyDetail,
  listHousesWithSupplies,
} from '@/lib/services/houses-supplies';
import { listReadings } from '@/lib/services/readings';
import { dashboardRange, orNotFound, PERIOD_QUERIES, pageUser } from '../../page-helpers';
import { archiveSupplyAction, deleteSupplyAction, updateSupplyAction } from '../actions';

const LATEST_READINGS = 10;
const WATER_NOTE = "Per l'acqua non esiste una serie nazionale di riferimento: nessun confronto.";

/** The charts of one supply, in reading order: consumption, unit price, costs, year over year. */
function SupplyCharts({ dashboard, today }: { dashboard: SupplyDashboard; today: string }) {
  const { supply, months, yearOverYearMonths, rolling, isComparable } = dashboard;
  const endMonth = dashboard.lastBilledMonth ?? monthKeyOf(today);
  const costTotals = {
    last12Cents: rolling.last12.totalCents,
    previous12Cents: rolling.previous12.totalCents,
    isComparable,
  };
  const cost = toYearOverYearSeries(yearOverYearMonths, endMonth, 'cost');
  if (!isMetered(supply.kind)) {
    return (
      <>
        <CostsChart points={toCostSeries(months)} mode="flat" />
        <YearOverYearChart
          consumption={null}
          cost={cost}
          unit={null}
          totals={{ consumption: null, cost: costTotals }}
        />
      </>
    );
  }
  const unit = consumptionUnitOf(supply.kind);
  return (
    <>
      <ConsumptionChart
        points={toConsumptionSeries(months, { hasPhotovoltaic: supply.hasPhotovoltaic })}
        unit={unit}
        hasPhotovoltaic={supply.hasPhotovoltaic}
      />
      <UnitPriceChart
        points={toUnitPriceSeries(months)}
        unit={unit}
        references={[]}
        note={supply.kind === 'water' ? WATER_NOTE : undefined}
      />
      <CostsChart points={toCostSeries(months)} mode="supply" />
      <YearOverYearChart
        consumption={toYearOverYearSeries(yearOverYearMonths, endMonth, 'consumption')}
        cost={cost}
        unit={unit}
        totals={{
          consumption: {
            last12: rolling.last12.consumption,
            previous12: rolling.previous12.consumption,
            isComparable,
          },
          cost: costTotals,
        }}
      />
    </>
  );
}

export default async function SupplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string | string[] }>;
}) {
  const user = await pageUser();
  const { id } = await params;
  const range = dashboardRange((await searchParams).periodo);
  const today = romeToday(Date.now());
  const { supply, house } = await orNotFound(getSupplyDetail(getDb(), user.id, id));
  const [houses, deletion, { bills, hasNextPage }, dashboard] = await Promise.all([
    listHousesWithSupplies(getDb(), user.id, { includeArchived: false }),
    getDeletionSummary(getDb(), user.id, { supplyId: supply.id }),
    listBills(getDb(), user.id, { supplyId: supply.id, page: 1 }),
    getSupplyDashboard(getDb(), user.id, supply.id, { today, range }),
  ]);
  const readingUnit = isMetered(supply.kind) ? readingUnitOf(supply.kind) : null;
  const readings = readingUnit
    ? await listReadings(getDb(), user.id, { supplyId: supply.id, limit: LATEST_READINGS })
    : [];
  const archived = supply.archivedAt !== null;

  return (
    <Page
      title={
        <span className="flex items-center gap-2">
          <SupplyKindIcon kind={supply.kind} className="size-5 shrink-0 text-ink-soft" />
          {supply.label}
          {archived && <Stamp>archiviata</Stamp>}
        </span>
      }
      actions={
        <Link href={`/bollette/nuova?fornitura=${supply.id}`} className={buttonClass('primary')}>
          Nuova bolletta
        </Link>
      }
    >
      <dl className={`${panelClass} grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4`}>
        <dt className="text-ink-soft">Casa</dt>
        <dd className="font-semibold">{house.name}</dd>
        <dt className="text-ink-soft">Tipo</dt>
        <dd className="font-semibold">{KIND_LABELS[supply.kind]}</dd>
        <dt className="text-ink-soft">Fornitore</dt>
        <dd className="font-semibold">{supply.supplierName ?? '—'}</dd>
        <dt className="text-ink-soft">Identificativo</dt>
        <dd className="figures font-bold break-all" data-testid="supply-identifier">
          {supply.identifier ?? '—'}
        </dd>
        {supply.kind === 'electricity' && (
          <>
            <dt className="text-ink-soft">Fotovoltaico</dt>
            <dd className="font-semibold">{supply.hasPhotovoltaic ? 'Sì' : 'No'}</dd>
          </>
        )}
      </dl>

      <SupplyActions
        supply={{
          houseId: supply.houseId,
          kind: supply.kind,
          label: supply.label,
          supplierName: supply.supplierName,
          identifier: supply.identifier,
          hasPhotovoltaic: supply.hasPhotovoltaic,
        }}
        houses={houses.map((entry) => ({ id: entry.house.id, name: entry.house.name }))}
        archived={archived}
        deletion={deletion}
        updateAction={updateSupplyAction.bind(null, supply.id)}
        archiveAction={archiveSupplyAction.bind(null, supply.id)}
        deleteAction={deleteSupplyAction.bind(null, supply.id)}
      />

      {bills.length === 0 ? (
        <p className="text-ink-soft">
          Ancora nessuna bolletta:{' '}
          <Link href={`/bollette/nuova?fornitura=${supply.id}`} className="font-semibold text-link">
            aggiungi la prima
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <PeriodSelector
            current={range}
            hrefFor={(option) => `/forniture/${supply.id}?periodo=${PERIOD_QUERIES[option]}`}
          />
          <SupplyCharts dashboard={dashboard} today={today} />
        </div>
      )}

      <Section
        title="Bollette"
        actions={
          hasNextPage && (
            <Link href={`/bollette?fornitura=${supply.id}`} className="font-semibold text-link">
              Tutte le bollette
            </Link>
          )
        }
      >
        <BillList bills={bills} />
      </Section>

      {readingUnit && (
        <Section
          title="Ultime letture"
          actions={
            !archived && (
              <Link
                href={`/letture?fornitura=${supply.id}`}
                className={buttonClass('secondary', 'text-sm')}
              >
                Autolettura
              </Link>
            )
          }
        >
          <ReadingTable
            showSupply={false}
            readings={readings.map((reading) => ({ ...reading, unit: readingUnit }))}
          />
        </Section>
      )}
    </Page>
  );
}
