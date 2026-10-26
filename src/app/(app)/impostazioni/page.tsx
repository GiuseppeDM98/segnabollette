import { cookies } from 'next/headers';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { DeleteAccount } from '@/components/settings/delete-account';
import { ThemePicker } from '@/components/settings/theme-picker';
import { Page, Section } from '@/components/ui/page';
import { panelClass } from '@/components/ui/styles';
import { getDb } from '@/lib/container';
import { monthKeyOf, romeToday } from '@/lib/domain/dates';
import { EXTRACTION_MODEL } from '@/lib/extraction/pricing';
import { formatUsd } from '@/lib/format';
import { monthlyExtractionSpend } from '@/lib/services/extractions';
import { parseTheme } from '@/lib/theme';
import { pageUser } from '../page-helpers';
import { setTheme } from './actions';

export default async function SettingsPage() {
  const user = await pageUser();
  const theme = parseTheme((await cookies()).get('theme')?.value);
  const spend = await monthlyExtractionSpend(getDb(), user.id, monthKeyOf(romeToday(Date.now())));
  return (
    <Page title="Impostazioni">
      <Section title="Account">
        <dl className={`${panelClass} grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4`}>
          <dt className="text-ink-soft">Nome</dt>
          <dd className="font-semibold">{user.name}</dd>
          <dt className="text-ink-soft">Email</dt>
          <dd className="font-semibold break-all">{user.email}</dd>
        </dl>
        <SignOutButton />
      </Section>
      <Section title="Estrazioni con Claude">
        <p data-testid="extraction-spend">
          Questo mese: <span className="figures font-bold">{formatUsd(spend.costMicroUsd)}</span> in{' '}
          {spend.count} {spend.count === 1 ? 'estrazione' : 'estrazioni'}
        </p>
        <p className="text-sm text-ink-soft">Modello in uso: {EXTRACTION_MODEL}</p>
      </Section>
      <ThemePicker current={theme} onChange={setTheme} />
      <DeleteAccount />
    </Page>
  );
}
