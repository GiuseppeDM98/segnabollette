import 'server-only';
import { getBlobStore, isBlobConfigured } from '@/lib/container';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { createAuth } from './create-auth';

export const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  signupEnabled: env.SIGNUP_ENABLED,
  // Off outside production and under Playwright, whose global setup signs in back to back.
  rateLimitEnabled: process.env.NODE_ENV === 'production' && !env.E2E_FAKE_SERVICES,
  // Without a Blob token there is no file to delete.
  afterUserDeleted: async (userId) => {
    if (isBlobConfigured()) await getBlobStore().deleteUserDocuments(userId);
  },
});
