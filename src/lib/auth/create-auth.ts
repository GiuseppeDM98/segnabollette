/**
 * Better Auth factory. The server instance lives in auth.ts; tests build their own on a temp DB.
 *
 * Design: email + password only (no outbound email, so no verification and no reset). Signup is
 * closed by the server through disableSignUp, not only hidden in the UI. The rate limiter keeps
 * its counters in the database because on Vercel each Fluid instance would otherwise count alone.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { nanoid } from 'nanoid';
import type { Db } from '@/lib/db/create-db';
import * as schema from '@/lib/db/schema';
import { deleteAllUserData } from '@/lib/services/user-data';

export interface CreateAuthOptions {
  db: Db;
  secret: string;
  baseURL: string;
  signupEnabled: boolean;
  rateLimitEnabled: boolean;
  /** Runs after the user row is gone; the Blob cleanup plugs in here. */
  afterUserDeleted?: (userId: string) => Promise<void>;
}

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(options.db, { provider: 'sqlite', usePlural: true, schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.signupEnabled,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    user: {
      deleteUser: {
        enabled: true,
        // App tables have no cascade (foreign keys are off on remote Turso): remove the user's rows
        // explicitly before Better Auth deletes the user.
        beforeDelete: async (user: { id: string }) => {
          await deleteAllUserData(options.db, user.id);
        },
        afterDelete: async (user: { id: string }) => {
          // Why: the rows are already gone; a failed file cleanup must not report the deletion as
          // failed. Orphan files stay recoverable by the Blob prune script.
          try {
            await options.afterUserDeleted?.(user.id);
          } catch (error) {
            console.error('afterUserDeleted failed', error);
          }
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 180,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: { enabled: options.rateLimitEnabled, storage: 'database' },
    advanced: { database: { generateId: () => nanoid() } },
    plugins: [nextCookies()], // must stay the last plugin
  });
}

export type Auth = ReturnType<typeof createAuth>;
