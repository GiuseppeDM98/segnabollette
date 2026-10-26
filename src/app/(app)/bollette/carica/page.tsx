import Link from 'next/link';
import { Page } from '@/components/ui/page';
import { buttonClass } from '@/components/ui/styles';
import { BillUploader } from '@/components/upload/bill-uploader';
import { getDb, isExtractionConfigured } from '@/lib/container';
import { formatSupplyLabel } from '@/lib/format';
import { listHousesWithSupplies } from '@/lib/services/houses-supplies';
import { pageUser, queryValue } from '../../page-helpers';

export default async function UploadBillPage({
  searchParams,
}: {
  searchParams: Promise<{ fornitura?: string | string[] }>;
}) {
  const user = await pageUser();
  const preselected = queryValue((await searchParams).fornitura);
  const houses = await listHousesWithSupplies(getDb(), user.id, { includeArchived: false });

  if (houses.length === 0) {
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

  if (!isExtractionConfigured()) {
    return (
      <Page title="Carica una bolletta">
        <p className="text-ink-soft">Estrazione non configurata su questa installazione.</p>
        <Link
          href={preselected ? `/bollette/nuova?fornitura=${preselected}` : '/bollette/nuova'}
          className={buttonClass('primary', 'self-start')}
        >
          Inserisci a mano
        </Link>
      </Page>
    );
  }

  const supplies = houses.flatMap(({ house, supplies: own }) =>
    own.map((supply) => ({
      id: supply.id,
      label: formatSupplyLabel(supply.label, house.name, houses.length),
    })),
  );
  // A query naming a supply that is not one of these (archived, someone else's) selects nothing.
  const preselectedSupplyId = supplies.some((supply) => supply.id === preselected)
    ? preselected
    : undefined;

  return (
    <Page title="Carica una bolletta">
      <p className="max-w-prose text-ink-soft">
        Il file resta privato nel tuo archivio. Claude legge la bolletta solo quando premi «Estrai»,
        e prima di salvare controlli tu ogni voce.
      </p>
      <BillUploader mode="extract" supplies={supplies} preselectedSupplyId={preselectedSupplyId} />
    </Page>
  );
}
