import Link from 'next/link';
import { BillList } from '@/components/bills/bill-list';
import { BillSupplyFilter } from '@/components/bills/bill-supply-filter';
import { Page } from '@/components/ui/page';
import { buttonClass } from '@/components/ui/styles';
import { getDb } from '@/lib/container';
import { formatSupplyLabel } from '@/lib/format';
import { listBills } from '@/lib/services/bills';
import { getSupplyDetail, listHousesWithSupplies } from '@/lib/services/houses-supplies';
import { orNotFound, pageNumber, pageUser, queryValue } from '../page-helpers';

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string | string[]; fornitura?: string | string[] }>;
}) {
  const user = await pageUser();
  const query = await searchParams;
  const page = pageNumber(query.pagina);
  const supplyId = queryValue(query.fornitura);
  if (supplyId !== undefined) await orNotFound(getSupplyDetail(getDb(), user.id, supplyId));
  const [{ bills, hasNextPage }, houses] = await Promise.all([
    listBills(getDb(), user.id, { supplyId, page }),
    listHousesWithSupplies(getDb(), user.id, { includeArchived: true }),
  ]);
  const supplies = houses.flatMap(({ house, supplies: own }) =>
    own.map((supply) => ({
      id: supply.id,
      label: formatSupplyLabel(supply.label, house.name, houses.length),
    })),
  );
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (supplyId !== undefined) params.set('fornitura', supplyId);
    if (target > 1) params.set('pagina', String(target));
    const text = params.toString();
    return text === '' ? '/bollette' : `/bollette?${text}`;
  };

  return (
    <Page
      title="Bollette"
      actions={
        <Link
          href={supplyId ? `/bollette/nuova?fornitura=${supplyId}` : '/bollette/nuova'}
          className={buttonClass('primary')}
        >
          Nuova bolletta
        </Link>
      }
    >
      {supplies.length > 0 && (
        <BillSupplyFilter supplies={supplies} selectedId={supplyId ?? null} />
      )}
      <BillList
        bills={bills.map((bill) => ({
          ...bill,
          supply: { label: bill.supplyLabel, kind: bill.supplyKind },
        }))}
      />
      {(page > 1 || hasNextPage) && (
        <nav aria-label="Pagine" className="flex flex-wrap justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonClass('secondary')}>
              Pagina precedente
            </Link>
          ) : (
            <span />
          )}
          {hasNextPage && (
            <Link href={pageHref(page + 1)} className={buttonClass('secondary')}>
              Pagina successiva
            </Link>
          )}
        </nav>
      )}
    </Page>
  );
}
