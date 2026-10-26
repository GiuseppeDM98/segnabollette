import { requireUser } from '@/lib/auth/session';
import { getBillExtractor, getBlobStore, getDb } from '@/lib/container';
import { toErrorResponse } from '@/lib/http/error-status';
import { runExtraction } from '@/lib/services/extractions';

// The call to Claude stops itself at 280 s; the function may live up to 300.
export const maxDuration = 300;

/** The paid step, at the owner's click. A failed extraction is a 200 with its code and message. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const extraction = await runExtraction(getDb(), user.id, id, {
      blob: getBlobStore(),
      extractor: getBillExtractor(),
      now: Date.now(),
      clock: () => Date.now(),
    });
    return Response.json({
      status: extraction.status,
      errorCode: extraction.errorCode,
      errorMessage: extraction.errorMessage,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
