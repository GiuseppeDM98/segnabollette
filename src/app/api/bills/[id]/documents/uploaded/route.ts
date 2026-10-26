import { AttachmentUploadedBodySchema, readBody } from '@/app/api/upload-schemas';
import { requireUser } from '@/lib/auth/session';
import { getBlobStore, getDb } from '@/lib/container';
import { toErrorResponse } from '@/lib/http/error-status';
import { markAttachmentUploaded } from '@/lib/services/extractions';

/** The attached files are on Blob: verify them; an invalid one is deleted with its row. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { documentIds } = await readBody(request, AttachmentUploadedBodySchema);
    await markAttachmentUploaded(getDb(), user.id, id, documentIds, {
      blob: getBlobStore(),
      now: Date.now(),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
