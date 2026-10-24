import { cookies } from 'next/headers';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { DeleteAccount } from '@/components/settings/delete-account';
import { ThemePicker } from '@/components/settings/theme-picker';
import { Page, Section } from '@/components/ui/page';
import { panelClass } from '@/components/ui/styles';
import { parseTheme } from '@/lib/theme';
import { pageUser } from '../page-helpers';
import { setTheme } from './actions';

export default async function SettingsPage() {
  const user = await pageUser();
  const theme = parseTheme((await cookies()).get('theme')?.value);
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
      <ThemePicker current={theme} onChange={setTheme} />
      <DeleteAccount />
    </Page>
  );
}
