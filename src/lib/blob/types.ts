/**
 * The private file store of the bills, seen by the services. The real store is Vercel Blob
 * (vercel-blob-store.ts); Playwright uses a folder on disk (disk-blob-store.ts). Pathnames are
 * users/{userId}/documents/{documentId}.{pdf|jpg}, so one user's files share a prefix.
 */
import type { DocumentContentType } from '@/lib/domain/types';

export interface BlobStore {
  /** The file's bytes, or null when the pathname does not exist. */
  readDocument(pathname: string): Promise<Uint8Array | null>;
  deleteDocuments(pathnames: readonly string[]): Promise<void>;
  /** Every file under users/{userId}/ — the account-deletion cleanup. */
  deleteUserDocuments(userId: string): Promise<void>;
  listPathnames(prefix: string): Promise<string[]>;
}

/** A PDF as stored. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** One JPEG: 6.7 MB once base64-encoded, under the API's 10 MB per image. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** All the files of one extraction: 26.7 MB once base64-encoded, under the API's 32 MB per request. */
export const MAX_EXTRACTION_BYTES = 20 * 1024 * 1024;

export function maxBytesFor(contentType: DocumentContentType): number {
  return contentType === 'application/pdf' ? MAX_DOCUMENT_BYTES : MAX_PHOTO_BYTES;
}

export function documentPathname(
  userId: string,
  documentId: string,
  contentType: DocumentContentType,
): string {
  return `users/${userId}/documents/${documentId}.${contentType === 'application/pdf' ? 'pdf' : 'jpg'}`;
}

/** The prefix of every file of a user. */
export function userPrefix(userId: string): string {
  return `users/${userId}/`;
}
