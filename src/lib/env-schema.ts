/**
 * The one schema of the process environment. `env.ts` is its server-only instance; CLI scripts
 * parse `process.env` with this schema directly, because importing `server-only` outside the
 * React Server environment throws.
 */
import { z } from 'zod';

const booleanFlag = (fallback: 'true' | 'false') =>
  z
    // An empty line in .env.local arrives as '': treat it as absent.
    .preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['true', 'false', '1', '0']).default(fallback),
    )
    .transform((value) => value === 'true' || value === '1');

export const EnvSchema = z
  .object({
    TURSO_DATABASE_URL: z.string().min(1, 'TURSO_DATABASE_URL is required'),
    // An empty line in .env.local arrives as '': treat it as absent.
    TURSO_AUTH_TOKEN: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_URL: z.url('BETTER_AUTH_URL must be an absolute URL'),
    SIGNUP_ENABLED: booleanFlag('false'),
    E2E_FAKE_SERVICES: booleanFlag('false'),
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
    // Both optional: without the key the app works and extraction says it is not configured;
    // without the Blob token uploads, documents and attachments are hidden.
    ANTHROPIC_API_KEY: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
    BLOB_READ_WRITE_TOKEN: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
    /** Where the Playwright fake Blob store keeps its files. */
    E2E_BLOB_DIR: z.string().default('.e2e-blob'),
  })
  .superRefine((env, ctx) => {
    if (env.TURSO_DATABASE_URL.startsWith('libsql://') && !env.TURSO_AUTH_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURSO_AUTH_TOKEN'],
        message: 'TURSO_AUTH_TOKEN is required for a remote libsql:// database',
      });
    }
    if (env.E2E_FAKE_SERVICES && env.VERCEL_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['E2E_FAKE_SERVICES'],
        message: 'E2E_FAKE_SERVICES must never be set in production',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;
