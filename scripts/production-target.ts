/**
 * The production database that maintenance scripts write to, read from .env.turso-prod.
 *
 * Why a file and not variables exported into the shell: the same command must work from
 * PowerShell and from bash, and a script must refuse to run against a local file by mistake.
 */
import { config } from 'dotenv';

export function readProductionTarget(env: Readonly<Record<string, string | undefined>>): {
  url: string;
  authToken: string;
} {
  const url = env.TURSO_DATABASE_URL ?? '';
  const authToken = env.TURSO_AUTH_TOKEN ?? '';
  if (!url.startsWith('libsql://')) throw new Error(`Refusing a non-Turso database URL: "${url}"`);
  if (!authToken) throw new Error('TURSO_AUTH_TOKEN missing in .env.turso-prod');
  return { url, authToken };
}

export function loadProductionTarget(): { url: string; authToken: string } {
  // override: a TURSO_DATABASE_URL left in the environment must never win over the production file.
  const result = config({ path: '.env.turso-prod', override: true });
  if (result.error) throw new Error('.env.turso-prod not found (see SETUP.md)');
  return readProductionTarget(process.env);
}
