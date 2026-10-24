import { SignInForm } from '@/components/auth/sign-in-form';
import { safeNextPath } from '@/lib/auth/public-paths';
import { env } from '@/lib/env';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-lg font-bold">Accedi</h1>
      <SignInForm
        nextPath={safeNextPath(typeof next === 'string' ? next : null)}
        signupEnabled={env.SIGNUP_ENABLED}
      />
    </>
  );
}
