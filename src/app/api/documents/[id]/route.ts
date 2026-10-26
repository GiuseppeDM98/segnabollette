import { requireUser } from '@/lib/auth/session';
import { getBlobStore, getDb } from '@/lib/container';
import { toErrorResponse } from '@/lib/http/error-status';
import { readDocumentFile } from '@/lib/services/extractions';

/** A bill's file, read with the session's user: another user's document is a 404. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { bytes, contentType } = await readDocumentFile(getDb(), user.id, id, {
      blob: getBlobStore(),
    });
    // A copy typed on a plain ArrayBuffer, the only kind a Response body accepts.
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
