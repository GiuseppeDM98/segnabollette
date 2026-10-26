import { requireUser } from '@/lib/auth/session';
import { getBlobStore, getDb } from '@/lib/container';
import { toErrorResponse } from '@/lib/http/error-status';
import { markExtractionUploaded } from '@/lib/services/extractions';

/** The files are on Blob: verify them and answer with the estimate. Claude is not called here. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const estimate = await markExtractionUploaded(getDb(), user.id, id, {
      blob: getBlobStore(),
      now: Date.now(),
    });
    return Response.json(estimate);
  } catch (error) {
    return toErrorResponse(error);
  }
}
