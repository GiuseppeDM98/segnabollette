import { describe, expect, it } from 'vitest';
import { EnvSchema } from './env-schema';

const MINIMAL_ENV = {
  TURSO_DATABASE_URL: 'file:test.db',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
};

function issuePaths(input: Record<string, string>): string[] {
  const result = EnvSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('EnvSchema', () => {
  it('names TURSO_DATABASE_URL when the environment is empty', () => {
    expect(issuePaths({})).toContain('TURSO_DATABASE_URL');
  });

  it('keeps signup closed when SIGNUP_ENABLED is missing', () => {
    expect(EnvSchema.parse(MINIMAL_ENV).SIGNUP_ENABLED).toBe(false);
  });

  it('opens signup when SIGNUP_ENABLED is "true"', () => {
    expect(EnvSchema.parse({ ...MINIMAL_ENV, SIGNUP_ENABLED: 'true' }).SIGNUP_ENABLED).toBe(true);
  });

  it('keeps signup closed when SIGNUP_ENABLED is an empty line', () => {
    expect(EnvSchema.parse({ ...MINIMAL_ENV, SIGNUP_ENABLED: '' }).SIGNUP_ENABLED).toBe(false);
  });

  it('requires a token for a remote libsql:// database', () => {
    expect(issuePaths({ ...MINIMAL_ENV, TURSO_DATABASE_URL: 'libsql://x' })).toContain(
      'TURSO_AUTH_TOKEN',
    );
  });

  it('treats an empty TURSO_AUTH_TOKEN as absent', () => {
    expect(
      EnvSchema.parse({ ...MINIMAL_ENV, TURSO_AUTH_TOKEN: '' }).TURSO_AUTH_TOKEN,
    ).toBeUndefined();
  });

  it('refuses the fake services in production', () => {
    expect(
      issuePaths({ ...MINIMAL_ENV, E2E_FAKE_SERVICES: '1', VERCEL_ENV: 'production' }),
    ).toContain('E2E_FAKE_SERVICES');
  });
});
