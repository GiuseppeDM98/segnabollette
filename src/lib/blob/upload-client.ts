'use client';

import { upload } from '@vercel/blob/client';

/** Send one file straight from the browser to the private store; Playwright builds use a local fake. */
export async function uploadDocumentFile(args: {
  file: Blob;
  pathname: string;
  documentId: string;
  contentType: string;
}): Promise<void> {
  // Next inlines NEXT_PUBLIC_* variables at build time: only the Playwright build has it.
  if (process.env.NEXT_PUBLIC_E2E_FAKE_SERVICES === '1') {
    const query = new URLSearchParams({ documentId: args.documentId, pathname: args.pathname });
    const response = await fetch(`/api/e2e/blob?${query.toString()}`, {
      method: 'PUT',
      body: args.file,
    });
    if (!response.ok) throw new Error(`fake upload failed: ${response.status}`);
    return;
  }
  await upload(args.pathname, args.file, {
    access: 'private',
    handleUploadUrl: '/api/documents/upload',
    clientPayload: args.documentId,
    contentType: args.contentType,
  });
}
