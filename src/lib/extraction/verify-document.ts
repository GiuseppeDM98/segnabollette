/**
 * The server's check of a file the browser uploaded straight to Blob: nothing the browser declared
 * is trusted until the stored bytes say the same. Nothing depends on Blob's upload-completed
 * callback (it never fires on localhost), so this is the one gate before a file is used.
 */
import { createHash } from 'node:crypto';
import { getDocumentProxy } from 'unpdf';
import { maxBytesFor } from '@/lib/blob/types';
import type { DocumentContentType } from '@/lib/domain/types';
import { DomainError } from '@/lib/errors';

export interface VerifiedDocument {
  pageCount: number | null;
}

const MAX_PDF_PAGES = 40;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const ENCRYPT_MARKER = new TextEncoder().encode('/Encrypt');

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

function contains(bytes: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function invalid(message: string): DomainError {
  return new DomainError('DOCUMENT_INVALID', message);
}

/** Check a stored file against what the browser declared, before anyone uses it. */
export async function verifyDocument(
  bytes: Uint8Array,
  declared: { contentType: DocumentContentType; sha256: string; sizeBytes: number },
): Promise<VerifiedDocument> {
  const isPdf = declared.contentType === 'application/pdf';
  if (bytes.length > maxBytesFor(declared.contentType)) {
    throw invalid(isPdf ? 'Il PDF supera i 10 MB.' : 'La foto supera i 5 MB.');
  }
  if (bytes.length !== declared.sizeBytes) throw invalid('Il file non è arrivato intero.');
  if (!startsWith(bytes, isPdf ? PDF_MAGIC : JPEG_MAGIC)) {
    throw invalid(isPdf ? 'Il file non è un PDF.' : 'Il file non è una foto JPEG.');
  }
  if (createHash('sha256').update(bytes).digest('hex') !== declared.sha256) {
    throw invalid('Il file arrivato è diverso da quello scelto.');
  }
  if (!isPdf) return { pageCount: null };

  // Even a PDF protected only against editing, which opens without a password, is unreadable
  // for the API: its encryption dictionary is enough to refuse it.
  if (contains(bytes, ENCRYPT_MARKER)) throw invalid('PDF protetto: carica le foto delle pagine.');
  let pageCount: number;
  try {
    // A copy: pdf.js may take over (detach) the buffer it is given.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    pageCount = pdf.numPages;
    await pdf.loadingTask.destroy();
  } catch {
    throw invalid('PDF danneggiato.');
  }
  if (pageCount > MAX_PDF_PAGES) throw invalid('La bolletta ha più di 40 pagine.');
  return { pageCount };
}
