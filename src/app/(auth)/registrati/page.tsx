import Link from 'next/link';
import { connection } from 'next/server';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { env } from '@/lib/env';

export default async function SignUpPage() {
  // Why: without a dynamic API Next prerenders this page at build time and freezes the
  // SIGNUP_ENABLED of that moment; the two E2E servers and a change in production need it read
  // on every request.
  await connection();
  if (!env.SIGNUP_ENABLED) {
    return (
      <>
        <h1 className="mb-4 text-lg font-bold">Le iscrizioni sono chiuse</h1>
        <p className="mb-4 text-ink-soft">
          Questa installazione di Segnabollette non accetta nuovi account.
        </p>
        <Link href="/accedi" className="font-semibold text-link">
          Accedi
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-4 text-lg font-bold">Crea un account</h1>
      <SignUpForm />
    </>
  );
}
