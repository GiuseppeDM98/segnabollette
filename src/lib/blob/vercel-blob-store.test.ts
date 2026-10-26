import { del, list } from '@vercel/blob';
import { describe, expect, it, vi } from 'vitest';
import { createVercelBlobStore } from './vercel-blob-store';

vi.mock('@vercel/blob', () => ({ del: vi.fn(), get: vi.fn(), list: vi.fn() }));

function pathnames(from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `users/abc/documents/${from + i}.pdf`);
}

describe('createVercelBlobStore', () => {
  it('deletes every page of the account in blocks of 500, with the token', async () => {
    // Arrange: two pages of listing, 1000 and 200 files.
    const first = pathnames(0, 1000);
    const second = pathnames(1000, 200);
    vi.mocked(list)
      .mockResolvedValueOnce({
        blobs: first.map((pathname) => ({ pathname })),
        hasMore: true,
        cursor: 'next',
      } as never)
      .mockResolvedValueOnce({
        blobs: second.map((pathname) => ({ pathname })),
        hasMore: false,
      } as never);

    // Act
    await createVercelBlobStore('token-di-prova').deleteUserDocuments('abc');

    // Assert
    expect(vi.mocked(list).mock.calls.map(([options]) => options)).toEqual([
      { prefix: 'users/abc/', cursor: undefined, limit: 1000, token: 'token-di-prova' },
      { prefix: 'users/abc/', cursor: 'next', limit: 1000, token: 'token-di-prova' },
    ]);
    const deleted = vi.mocked(del).mock.calls.map(([batch]) => batch);
    expect(deleted.map((batch) => (batch as string[]).length)).toEqual([500, 500, 200]);
    expect(deleted.flat()).toEqual([...first, ...second]);
    expect(
      vi.mocked(del).mock.calls.every(([, options]) => options?.token === 'token-di-prova'),
    ).toBe(true);
  });
});
