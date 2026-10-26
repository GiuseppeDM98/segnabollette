/**
 * The real file store: a private Vercel Blob store, read only on the server with the read-write
 * token (the only file that uses the store API of @vercel/blob; the token route imports only
 * handleUpload from @vercel/blob/client). Files never pass through a function on
 * the way in: the browser uploads them directly (upload-client.ts and /api/documents/upload).
 *
 * No 'server-only' import: documents:prune runs it under tsx, where that package throws. The token
 * arrives as an argument; only the container, which is server-only, reads it from the environment.
 */
import { del, get, list } from '@vercel/blob';
import { type BlobStore, userPrefix } from './types';

/** Blob deletes many pathnames per call; blocks keep each request a reasonable size. */
const DELETE_BLOCK_SIZE = 500;

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function createVercelBlobStore(token: string): BlobStore {
  async function listPathnames(prefix: string): Promise<string[]> {
    const pathnames: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000, token });
      pathnames.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return pathnames;
  }

  async function deleteDocuments(pathnames: readonly string[]): Promise<void> {
    if (pathnames.length === 0) return;
    await del([...pathnames], { token });
  }

  return {
    async readDocument(pathname) {
      // useCache false: a resumed upload rewrites the same pathname, and the CDN copy could be
      // the interrupted one.
      const result = await get(pathname, { access: 'private', useCache: false, token });
      if (result?.statusCode !== 200) return null;
      return readStream(result.stream);
    },
    deleteDocuments,
    async deleteUserDocuments(userId) {
      const pathnames = await listPathnames(userPrefix(userId));
      for (let start = 0; start < pathnames.length; start += DELETE_BLOCK_SIZE) {
        await deleteDocuments(pathnames.slice(start, start + DELETE_BLOCK_SIZE));
      }
    },
    listPathnames,
  };
}
