/**
 * The Playwright file store: the same semantics as the Vercel one, on a folder of the disk
 * (`<dir>/<pathname>`). A store in memory would not survive between the bundles of the routes.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { type BlobStore, userPrefix } from './types';

async function walk(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

export type DiskBlobStore = BlobStore & {
  writeDocument(pathname: string, bytes: Uint8Array): Promise<void>;
};

export function createDiskBlobStore(dir: string): DiskBlobStore {
  const pathOf = (pathname: string) => join(dir, ...pathname.split('/'));
  async function deleteDocuments(pathnames: readonly string[]): Promise<void> {
    for (const pathname of pathnames) await rm(pathOf(pathname), { force: true });
  }
  async function listPathnames(prefix: string): Promise<string[]> {
    return (await walk(dir)).filter((pathname) => pathname.startsWith(prefix));
  }
  return {
    async readDocument(pathname) {
      const file = pathOf(pathname);
      if (!existsSync(file)) return null;
      return new Uint8Array(await readFile(file));
    },
    deleteDocuments,
    async deleteUserDocuments(userId) {
      await deleteDocuments(await listPathnames(userPrefix(userId)));
    },
    listPathnames,
    /** The fake upload route and the tests write here; overwriting, like allowOverwrite. */
    async writeDocument(pathname, bytes) {
      const file = pathOf(pathname);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
    },
  };
}
