import { requireUser } from '@/lib/auth/session';
import { createDiskBlobStore } from '@/lib/blob/disk-blob-store';
import { getDb } from '@/lib/container';
import { env } from '@/lib/env';
import { toErrorResponse } from '@/lib/http/error-status';
import { authorizeDocumentUpload } from '@/lib/services/extractions';

/** Playwright's stand-in for the direct upload to Blob; it does not exist outside those builds. */
export async function PUT(request: Request): Promise<Response> {
  if (!env.E2E_FAKE_SERVICES) return new Response(null, { status: 404 });
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId') ?? '';
    const pathname = url.searchParams.get('pathname') ?? '';
    await authorizeDocumentUpload(getDb(), user.id, documentId, pathname);
    const bytes = new Uint8Array(await request.arrayBuffer());
    // Overwriting, like allowOverwrite on the real store: a resumed upload writes again.
    await createDiskBlobStore(env.E2E_BLOB_DIR).writeDocument(pathname, bytes);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
