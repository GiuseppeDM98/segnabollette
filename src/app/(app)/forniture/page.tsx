import Link from 'next/link';
import { HousePanel } from '@/components/houses/house-panel';
import { NewHouseForm } from '@/components/houses/new-house-form';
import { Page } from '@/components/ui/page';
import { getDb } from '@/lib/container';
import { romeToday } from '@/lib/domain/dates';
import { listHousehold } from '@/lib/services/household';
import { getDeletionSummary, listHousesWithSupplies } from '@/lib/services/houses-supplies';
import { pageUser, queryValue } from '../page-helpers';
import {
  addHouseholdSizeAction,
  createHouseAction,
  createSupplyAction,
  deleteHouseAction,
  deleteHouseholdSizeAction,
  renameHouseAction,
} from './actions';

export default async function SuppliesPage({
  searchParams,
}: {
  searchParams: Promise<{ archiviate?: string | string[] }>;
}) {
  const user = await pageUser();
  const showArchived = queryValue((await searchParams).archiviate) === '1';
  const houses = await listHousesWithSupplies(getDb(), user.id, { includeArchived: true });
  const [summaries, households] = await Promise.all([
    Promise.all(
      houses.map(({ house }) => getDeletionSummary(getDb(), user.id, { houseId: house.id })),
    ),
    Promise.all(houses.map(({ house }) => listHousehold(getDb(), user.id, house.id))),
  ]);
  const today = romeToday(Date.now());
  const houseOptions = houses.map(({ house }) => ({ id: house.id, name: house.name }));
  const archivedCount = houses
    .flatMap((entry) => entry.supplies)
    .filter((supply) => supply.archivedAt !== null).length;

  return (
    <Page
      title="Forniture"
      actions={
        archivedCount > 0 && (
          <Link
            href={showArchived ? '/forniture' : '/forniture?archiviate=1'}
            className="inline-flex min-h-11 items-center font-semibold text-link"
          >
            {showArchived ? 'Nascondi archiviate' : `Mostra archiviate (${archivedCount})`}
          </Link>
        )
      }
    >
      {houses.map(({ house, supplies }, index) => (
        <HousePanel
          key={house.id}
          house={{ id: house.id, name: house.name }}
          houses={houseOptions}
          supplies={supplies
            .filter((supply) => showArchived || supply.archivedAt === null)
            .map((supply) => ({
              id: supply.id,
              kind: supply.kind,
              label: supply.label,
              supplierName: supply.supplierName,
              identifier: supply.identifier,
              archived: supply.archivedAt !== null,
            }))}
          deletion={summaries[index] ?? { supplies: 0, bills: 0, readings: 0 }}
          renameAction={renameHouseAction.bind(null, house.id)}
          deleteAction={deleteHouseAction.bind(null, house.id)}
          createSupplyAction={createSupplyAction}
          household={{
            entries: (households[index] ?? []).map(({ id, validFrom, people }) => ({
              id,
              validFrom,
              people,
            })),
            today,
            addAction: addHouseholdSizeAction.bind(null, house.id),
            deleteAction: deleteHouseholdSizeAction,
          }}
        />
      ))}
      <NewHouseForm onSubmit={createHouseAction} />
    </Page>
  );
}
