import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db/create-db';
import { accounts, rateLimits, sessions, users } from '@/lib/db/schema/auth';
import { createTestDb } from '@/lib/db/testing/create-test-db';
import { deleteAllUserData } from '@/lib/services/user-data';
import { type CreateAuthOptions, createAuth } from './create-auth';

// Wrap the real implementation, so the test both runs it and sees that it was called.
vi.mock('@/lib/services/user-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/user-data')>();
  return { deleteAllUserData: vi.fn(actual.deleteAllUserData) };
});

const BASE_URL = 'http://localhost:3000';
const SESSION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'password-di-prova-1';

function buildAuth(db: Db, overrides?: Partial<CreateAuthOptions>) {
  return createAuth({
    db,
    secret: 'test-secret-test-secret-test-secret-00',
    baseURL: BASE_URL,
    signupEnabled: true,
    rateLimitEnabled: false,
    ...overrides,
  });
}

async function signUp(auth: ReturnType<typeof buildAuth>, email: string) {
  return auth.api.signUpEmail({ body: { name: 'Pellicano', email, password: PASSWORD } });
}

/** Sign in and turn the Set-Cookie answer into the Cookie header of the next request. */
async function signInHeaders(auth: ReturnType<typeof buildAuth>, email: string) {
  const { headers, response } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(';')[0])
    .join('; ');
  return { token: response.token, headers: new Headers({ cookie }) };
}

describe('createAuth', () => {
  it('signs a user up and in when signup is open', async () => {
    const { db } = await createTestDb();
    const auth = buildAuth(db);

    await signUp(auth, 'pellicano@example.test');
    const { token } = await signInHeaders(auth, 'pellicano@example.test');

    expect(token).toBeTruthy();
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('keeps a session for 180 days', async () => {
    // Arrange
    const { db } = await createTestDb();
    const auth = buildAuth(db);
    await signUp(auth, 'pellicano@example.test');

    // Act
    const { token } = await signInHeaders(auth, 'pellicano@example.test');

    // Assert
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
    if (!session) throw new Error('no session row for the sign-in token');
    const lifetimeMs = session.expiresAt.getTime() - session.createdAt.getTime();
    expect(Math.abs(lifetimeMs - SESSION_DAYS * DAY_MS)).toBeLessThan(60_000);
  });

  it('refuses a signup on the server when signup is closed', async () => {
    const { db } = await createTestDb();
    const auth = buildAuth(db, { signupEnabled: false });

    await expect(signUp(auth, 'pellicano@example.test')).rejects.toThrow();
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('deletes the user with its sessions and accounts and runs both hooks', async () => {
    // Arrange
    const { db } = await createTestDb();
    const afterUserDeleted = vi.fn(async () => {});
    const auth = buildAuth(db, { afterUserDeleted });
    await signUp(auth, 'pellicano@example.test');
    const { headers } = await signInHeaders(auth, 'pellicano@example.test');
    const [user] = await db.select({ id: users.id }).from(users);
    vi.mocked(deleteAllUserData).mockClear();

    // Act
    const result = await auth.api.deleteUser({ body: { password: PASSWORD }, headers });

    // Assert
    expect(result.success).toBe(true);
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(accounts)).toHaveLength(0);
    expect(deleteAllUserData).toHaveBeenCalledTimes(1);
    expect(deleteAllUserData).toHaveBeenCalledWith(db, user?.id);
    expect(afterUserDeleted).toHaveBeenCalledTimes(1);
    expect(afterUserDeleted).toHaveBeenCalledWith(user?.id);
  });

  it('deletes the user even when the after-delete cleanup throws', async () => {
    // Arrange
    const { db } = await createTestDb();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = buildAuth(db, {
      afterUserDeleted: async () => {
        throw new Error('blob cleanup failed');
      },
    });
    await signUp(auth, 'pellicano@example.test');
    const { headers } = await signInHeaders(auth, 'pellicano@example.test');

    // Act
    const result = await auth.api.deleteUser({ body: { password: PASSWORD }, headers });

    // Assert
    expect(result.success).toBe(true);
    expect(await db.select().from(users)).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('keeps the rate-limit counters in the database when the limiter is on', async () => {
    // Arrange
    const { db } = await createTestDb();
    const auth = buildAuth(db, { rateLimitEnabled: true });
    await signUp(auth, 'pellicano@example.test');

    // Act
    await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: BASE_URL,
          'x-forwarded-for': '203.0.113.7',
        },
        body: JSON.stringify({ email: 'pellicano@example.test', password: PASSWORD }),
      }),
    );

    // Assert
    expect((await db.select().from(rateLimits)).length).toBeGreaterThanOrEqual(1);
  });
});
