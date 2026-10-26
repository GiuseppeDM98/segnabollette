import { CreateExtractionBodySchema, readBody } from '@/app/api/upload-schemas';
import { requireUser } from '@/lib/auth/session';
import { getBlobStore, getDb } from '@/lib/container';
import { toErrorResponse } from '@/lib/http/error-status';
import { createExtraction } from '@/lib/services/extractions';

/** 201 with the pathnames to upload to; 200 when the files belong to an extraction already. */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readBody(request, CreateExtractionBodySchema);
    const result = await createExtraction(getDb(), user.id, body, {
      blob: getBlobStore(),
      now: Date.now(),
    });
    return Response.json(result, { status: 'extractionId' in result ? 201 : 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
