import Link from 'next/link';
import { BillList } from '@/components/bills/bill-list';
import { ReadingTable } from '@/components/readings/reading-table';
import { SupplyActions } from '@/components/supplies/supply-actions';
import { SupplyKindIcon } from '@/components/supplies/supply-kind-icon';
import { Page, Section } from '@/components/ui/page';
import { Stamp } from '@/components/ui/stamp';
import { buttonClass, panelClass } from '@/components/ui/styles';
import { getDb } from '@/lib/container';
import { isMetered, readingUnitOf } from '@/lib/domain/types';
import { KIND_LABELS } from '@/lib/format';
import { listBills } from '@/lib/services/bills';
import {
  getDeletionSummary,
  getSupplyDetail,
  listHousesWithSupplies,
} from '@/lib/services/houses-supplies';
import { listReadings } from '@/lib/services/readings';
import { orNotFound, pageUser } from '../../page-helpers';
import { archiveSupplyAction, deleteSupplyAction, updateSupplyAction } from '../actions';

const LATEST_READINGS = 10;

export default async function SupplyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const { supply, house } = await orNotFound(getSupplyDetail(getDb(), user.id, id));
  const [houses, deletion, { bills, hasNextPage }] = await Promise.all([
    listHousesWithSupplies(getDb(), user.id, { includeArchived: false }),
    getDeletionSummary(getDb(), user.id, { supplyId: supply.id }),
    listBills(getDb(), user.id, { supplyId: supply.id, page: 1 }),
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
