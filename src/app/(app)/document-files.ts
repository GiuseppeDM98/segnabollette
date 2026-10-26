import 'server-only';
import { getBlobStore, isBlobConfigured } from '@/lib/container';

/**
 * The files of deleted rows, removed after the batch that deleted the rows. A Blob failure is
 * logged and the delete stands: documents:prune finds an orphan file, nothing finds a row without
 * its file. Without a Blob token there is no file to delete.
 */
export async function deleteDocumentFiles(pathnames: readonly string[]): Promise<void> {
  if (pathnames.length === 0 || !isBlobConfigured()) return;
  try {
    await getBlobStore().deleteDocuments(pathnames);
  } catch (error) {
    console.error('Deleting files from Blob failed', error);
  }
}
