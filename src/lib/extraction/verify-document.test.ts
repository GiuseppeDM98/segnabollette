import { describe, expect, it } from 'vitest';
import { expectDomainError } from '@/lib/db/testing/fixtures';
import { fixtureBytes, sha256Of } from './testing/fixture-bills';
import { verifyDocument } from './verify-document';

function declared(bytes: Uint8Array, contentType: 'application/pdf' | 'image/jpeg') {
  return { contentType, sha256: sha256Of(bytes), sizeBytes: bytes.length };
}

/** A file of `size` bytes that starts with the given magic bytes. */
function fileOf(size: number, magic: number[]): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(magic);
  return bytes;
}

describe('verifyDocument', () => {
  it('counts the pages of a fixture PDF', async () => {
    const bytes = fixtureBytes('luce-pellicano.pdf');

    await expect(verifyDocument(bytes, declared(bytes, 'application/pdf'))).resolves.toEqual({
      pageCount: 1,
    });
  });

  it('refuses bytes that differ from the declared SHA-256', async () => {
    const bytes = fixtureBytes('luce-pellicano.pdf');
    const expected = declared(bytes, 'application/pdf');
    const altered = new Uint8Array(bytes);
    altered[altered.length - 10] = 0x41;

    await expectDomainError(verifyDocument(altered, expected), 'DOCUMENT_INVALID');
  });

  it('refuses a PDF declared as a JPEG', async () => {
    const bytes = fixtureBytes('luce-pellicano.pdf');

    await expectDomainError(
      verifyDocument(bytes, declared(bytes, 'image/jpeg')),
      'DOCUMENT_INVALID',
    );
  });

  it('refuses a PDF of 11 MB and a JPEG of 6 MB', async () => {
    const pdf = fileOf(11 * 1024 * 1024, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    const jpeg = fileOf(6 * 1024 * 1024, [0xff, 0xd8, 0xff]);

    await expectDomainError(
      verifyDocument(pdf, declared(pdf, 'application/pdf')),
      'DOCUMENT_INVALID',
    );
    await expectDomainError(verifyDocument(jpeg, declared(jpeg, 'image/jpeg')), 'DOCUMENT_INVALID');
  });

  it('refuses an encrypted PDF and asks for photos instead', async () => {
    const text = new TextDecoder().decode(fixtureBytes('luce-pellicano.pdf'));
    const encrypted = new TextEncoder().encode(
      text.replace('/Root 1 0 R >>', '/Root 1 0 R /Encrypt 5 0 R >>'),
    );

    const error = await expectDomainError(
      verifyDocument(encrypted, declared(encrypted, 'application/pdf')),
      'DOCUMENT_INVALID',
    );
    expect(error.message).toBe('PDF protetto: carica le foto delle pagine.');
  });
});
