import { CreateAttachmentBodySchema, readBody } from '@/app/api/upload-schemas';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/container';
import { toErrorResponse } from '@/lib/http/error-status';
import { createAttachment } from '@/lib/services/extractions';

/** Files attached to a bill typed by hand: 201 with the pathnames to upload to. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { files } = await readBody(request, CreateAttachmentBodySchema);
    const result = await createAttachment(getDb(), user.id, { billId: id, files });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
