import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReadingTable } from '@/components/readings/reading-table';
import { SelfReadingForm } from '@/components/readings/self-reading-form';
import { Page, Section } from '@/components/ui/page';
import { buttonClass } from '@/components/ui/styles';
import { getDb } from '@/lib/container';
import { romeToday } from '@/lib/domain/dates';
import { isMetered, type ReadingUnit, readingUnitOf } from '@/lib/domain/types';
import { formatSupplyLabel } from '@/lib/format';
import { listHousesWithSupplies } from '@/lib/services/houses-supplies';
import { latestReadings, listReadings, suggestedRegisters } from '@/lib/services/readings';
import { pageUser, queryValue } from '../page-helpers';
import { createReadingsAction, deleteReadingAction } from './actions';

export default async function ReadingsPage({
  searchParams,
}: {
  searchParams: Promise<{ fornitura?: string | string[] }>;
}) {
  const user = await pageUser();
  const supplyId = queryValue((await searchParams).fornitura);
  const houses = await listHousesWithSupplies(getDb(), user.id, { includeArchived: true });
  const allSupplies = houses.flatMap(({ house, supplies }) =>
    supplies.map((supply) => ({ supply, houseName: house.name })),
  );
  const unitBySupply = new Map<string, ReadingUnit>();
  for (const { supply } of allSupplies) {
    if (isMetered(supply.kind)) unitBySupply.set(supply.id, readingUnitOf(supply.kind));
  }
  // The form lists the metered supplies still in use; an archived or flat-fee one is not there.
  const choices = allSupplies.flatMap(({ supply, houseName }) => {
    const unit = unitBySupply.get(supply.id);
    if (unit === undefined || supply.archivedAt !== null) return [];
    const label = formatSupplyLabel(supply.label, houseName, houses.length);
    return [{ id: supply.id, label, unit }];
  });
  if (supplyId !== undefined && !choices.some((choice) => choice.id === supplyId)) notFound();

  const [registers, lastReadings, readings] = await Promise.all([
    Promise.all(choices.map((choice) => suggestedRegisters(getDb(), user.id, choice.id))),
    Promise.all(choices.map((choice) => latestReadings(getDb(), user.id, choice.id))),
    listReadings(getDb(), user.id, {}),
  ]);

  return (
    <Page title="Letture">
      {choices.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-ink-soft">
            Le autoletture servono alle forniture con un contatore: luce, gas e acqua.
          </p>
          <Link href="/forniture" className={buttonClass('secondary', 'self-start')}>
            Vai a Forniture
          </Link>
        </div>
      ) : (
        <SelfReadingForm
          supplies={choices}
          initialSupplyId={supplyId ?? null}
          today={romeToday(Date.now())}
          registersBySupply={Object.fromEntries(
            choices.map((choice, index) => [choice.id, registers[index] ?? ['single']]),
          )}
          lastReadingsBySupply={Object.fromEntries(
            choices.map((choice, index) => [choice.id, lastReadings[index] ?? {}]),
          )}
          onSubmit={createReadingsAction}
        />
      )}
      <Section title="Letture registrate">
        <ReadingTable
          readings={readings.flatMap((reading) => {
            const unit = unitBySupply.get(reading.supplyId);
            return unit ? [{ ...reading, unit }] : [];
          })}
          deleteAction={deleteReadingAction}
        />
      </Section>
    </Page>
  );
}
