import Link from 'next/link';
import { BillForm } from '@/components/bills/bill-form';
import { emptyBillInput } from '@/components/bills/line-templates';
import { SupplyKindIcon } from '@/components/supplies/supply-kind-icon';
import { Page, Section } from '@/components/ui/page';
import { buttonClass, panelClass } from '@/components/ui/styles';
import { getDb } from '@/lib/container';
import { romeToday } from '@/lib/domain/dates';
import { KIND_LABELS } from '@/lib/format';
import { getSupplyDetail, listHousesWithSupplies } from '@/lib/services/houses-supplies';
import { orNotFound, pageUser, queryValue } from '../../page-helpers';
import { saveBillAction } from '../actions';

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ fornitura?: string | string[] }>;
}) {
  const user = await pageUser();
  const supplyId = queryValue((await searchParams).fornitura);

  if (supplyId === undefined) {
    const houses = await listHousesWithSupplies(getDb(), user.id, { includeArchived: false });
    const withSupplies = houses.filter(({ supplies }) => supplies.length > 0);
    return (
      <Page title="Nuova bolletta">
        {withSupplies.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-ink-soft">Prima crea una casa e una fornitura.</p>
            <Link href="/forniture" className={buttonClass('primary', 'self-start')}>
              Vai a Forniture
            </Link>
          </div>
        ) : (
          <>
            <p className="text-ink-soft">Scegli la fornitura della bolletta.</p>
            {withSupplies.map(({ house, supplies }) => (
              <Section key={house.id} title={house.name}>
                <ul className={panelClass}>
                  {supplies.map((supply) => (
                    <li key={supply.id} className="border-b border-rule last:border-b-0">
                      <Link
                        href={`/bollette/nuova?fornitura=${supply.id}`}
                        className="flex min-h-11 items-center gap-3 px-3 py-2.5 text-ink no-underline hover:bg-surface-sunk"
                      >
                        <SupplyKindIcon
                          kind={supply.kind}
                          className="size-5 shrink-0 text-ink-soft"
                        />
                        <span className="font-semibold">{supply.label}</span>
                        <span className="text-sm text-ink-soft">{KIND_LABELS[supply.kind]}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            ))}
          </>
        )}
      </Page>
    );
  }

  const { supply } = await orNotFound(getSupplyDetail(getDb(), user.id, supplyId));
  return (
    <Page title="Nuova bolletta">
      <BillForm
        supply={{
          id: supply.id,
          kind: supply.kind,
          label: supply.label,
          hasPhotovoltaic: supply.hasPhotovoltaic,
        }}
        initialValue={emptyBillInput(supply, romeToday(Date.now()))}
        blankAmounts
        submitLabel="Salva bolletta"
        onSubmit={saveBillAction.bind(null, null)}
      />
    </Page>
  );
}
