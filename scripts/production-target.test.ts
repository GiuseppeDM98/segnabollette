import { describe, expect, it } from 'vitest';
import { readProductionTarget } from './production-target';

describe('readProductionTarget', () => {
  it('refuses a database URL that is not a Turso one', () => {
    const env = { TURSO_DATABASE_URL: 'file:local.db', TURSO_AUTH_TOKEN: 'x' };

    expect(() => readProductionTarget(env)).toThrow('Refusing a non-Turso database URL');
  });

  it('refuses a Turso URL without its token', () => {
    const env = { TURSO_DATABASE_URL: 'libsql://db-x.turso.io' };

    expect(() => readProductionTarget(env)).toThrow('TURSO_AUTH_TOKEN missing');
  });

  it('returns the Turso URL and its token', () => {
    const env = { TURSO_DATABASE_URL: 'libsql://db-x.turso.io', TURSO_AUTH_TOKEN: 'x' };

    const target = readProductionTarget(env);

    expect(target).toEqual({ url: 'libsql://db-x.turso.io', authToken: 'x' });
  });
});
