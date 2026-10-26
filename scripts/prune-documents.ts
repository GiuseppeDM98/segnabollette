/**
 * `pnpm documents:prune [-- --prod] [-- --delete] [-- --force]`: match the private file store
 * against the database. Lists the files under users/ without a row in `documents`, the extractions
 * still uploading and the attachments never uploaded after 24 hours. A dry run by default; with
 * --delete the rows go first and the files after.
 *
 * Why its own variables schema and not EnvSchema: that one demands Better Auth's variables too.
 * Why the production token only from .env.turso-prod: process.env holds the development store's
 * token from .env.local, and pairing a database with the wrong store would delete real files.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { z } from 'zod';
import { createVercelBlobStore } from '@/lib/blob/vercel-blob-store';
import { createDb } from '@/lib/db/create-db';
import {
  deleteStaleUploadsQuery,
  listAllDocumentPathnames,
  listStaleUploads,
} from '@/lib/db/maintenance/prune';
import { runBatch } from '@/lib/services/batch';
import { loadProductionTarget } from './production-target';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const DELETE_BLOCK_SIZE = 500;

const LocalEnvSchema = z.object({
  TURSO_DATABASE_URL: z.string().startsWith('file:', {
    message: 'Without --prod only a local file database (file:…) is accepted',
  }),
  TURSO_AUTH_TOKEN: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z
    .string()
    .min(1, { message: 'BLOB_READ_WRITE_TOKEN missing in .env.local' }),
});

function target(prod: boolean): { url: string; authToken?: string; blobToken: string } {
  if (!prod) {
    const env = LocalEnvSchema.parse(process.env);
    return {
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
      blobToken: env.BLOB_READ_WRITE_TOKEN,
    };
  }
  const database = loadProductionTarget();
  const blobToken = parse(readFileSync('.env.turso-prod')).BLOB_READ_WRITE_TOKEN;
  if (!blobToken)
    throw new Error('BLOB_READ_WRITE_TOKEN missing in .env.turso-prod (see SETUP.md)');
  return { ...database, blobToken };
}

/** The store's id without the secret: vercel_blob_rw_<storeId>. */
function storeLabel(token: string): string {
  return token.split('_').slice(0, 4).join('_');
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const prod = args.has('--prod');
  const shouldDelete = args.has('--delete');
  const force = args.has('--force');
  const { url, authToken, blobToken } = target(prod);
  const host = url.startsWith('file:') ? url : new URL(url).host;
  console.log(`Database: ${host}`);
  console.log(`File store: ${storeLabel(blobToken)}`);

  const { db, client } = createDb({ url, authToken });
  const blob = createVercelBlobStore(blobToken);
  try {
    const known = new Set(await listAllDocumentPathnames(db));
    const stored = await blob.listPathnames('users/');
    const orphans = stored.filter((pathname) => !known.has(pathname));
    const stale = await listStaleUploads(db, Date.now() - STALE_AFTER_MS);

    console.log(`Documents in the database: ${known.size}; files in the store: ${stored.length}`);
    console.log(`Files without a row: ${orphans.length}`);
    for (const pathname of orphans) console.log(`  ${pathname}`);
    console.log(
      `Uploads abandoned for more than 24 hours: ${stale.extractionIds.length} extractions, ${stale.documents.length} documents`,
    );
    for (const document of stale.documents) console.log(`  ${document.pathname}`);

    if (!shouldDelete) {
      console.log('Dry run: nothing deleted (add -- --delete to delete).');
      return;
    }
    if (known.size === 0 && stored.length > 0 && !force) {
      throw new Error(
        'The database has no document while the store has files: wrong pairing? Refusing without --force.',
      );
    }
    await runBatch(
      db,
      deleteStaleUploadsQuery(db, {
        documentIds: stale.documents.map((document) => document.id),
        extractionIds: stale.extractionIds,
      }),
    );
    const pathnames = [...orphans, ...stale.documents.map((document) => document.pathname)];
    for (let start = 0; start < pathnames.length; start += DELETE_BLOCK_SIZE) {
      await blob.deleteDocuments(pathnames.slice(start, start + DELETE_BLOCK_SIZE));
    }
    console.log(
      `Deleted: ${stale.documents.length + stale.extractionIds.length} rows, ${pathnames.length} files.`,
    );
  } finally {
    client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
