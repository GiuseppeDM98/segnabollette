'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth/session';
import { type ActionResult, toActionResult } from '@/lib/errors';
import { parseInput } from '@/lib/parse-input';
import { ThemeSchema } from './schemas';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The theme lives in a cookie the root layout reads, so the first paint already has it. */
export async function setTheme(theme: unknown): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const value = parseInput(ThemeSchema, theme);
    await requireUser();
    (await cookies()).set('theme', value, {
      maxAge: ONE_YEAR_SECONDS,
      sameSite: 'lax',
      path: '/',
    });
    revalidatePath('/', 'layout');
    return null;
  });
}
