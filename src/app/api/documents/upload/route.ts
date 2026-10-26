import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { requireUser } from '@/lib/auth/session';
import { maxBytesFor } from '@/lib/blob/types';
import { getDb } from '@/lib/container';
import { toErrorResponse } from '@/lib/http/error-status';
import { authorizeDocumentUpload } from '@/lib/services/extractions';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      // The session is checked here, not first: Vercel's upload-completed request reaches this
      // route without a session and does nothing.
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await requireUser();
        const documentId = clientPayload ?? '';
        const { contentType } = await authorizeDocumentUpload(
          getDb(),
          user.id,
          documentId,
          pathname,
        );
        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: maxBytesFor(contentType),
          addRandomSuffix: false,
          // A resumed upload writes the same pathname again.
          allowOverwrite: true,
          tokenPayload: documentId,
        };
      },
      // Never relied upon: it does not fire on localhost, and the server verifies every file itself
      // before using it.
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
