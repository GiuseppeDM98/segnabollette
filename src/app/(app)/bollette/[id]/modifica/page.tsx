import { redirect } from 'next/navigation';
import { BillForm } from '@/components/bills/bill-form';
import { Page } from '@/components/ui/page';
import { getDb } from '@/lib/container';
import { billInputFromDetail, getBillDetail } from '@/lib/services/bills';
import { orNotFound, pageUser } from '../../../page-helpers';
import { saveBillAction } from '../../actions';

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const detail = await orNotFound(getBillDetail(getDb(), user.id, id));
  // A replaced bill is archived: it is deleted, never edited.
  if (detail.bill.status === 'replaced') redirect(`/bollette/${detail.bill.id}`);
  const { supply } = detail;
  return (
    <Page title="Modifica bolletta">
      <BillForm
        supply={{
          id: supply.id,
          kind: supply.kind,
          label: supply.label,
          hasPhotovoltaic: supply.hasPhotovoltaic,
        }}
        initialValue={billInputFromDetail(detail)}
        submitLabel="Salva bolletta"
        onSubmit={saveBillAction.bind(null, detail.bill.id)}
      />
    </Page>
  );
}
