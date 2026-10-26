import { describe, expect, it } from 'vitest';
import { tempBlobStore } from '@/lib/extraction/testing/upload-fixture';

const BYTES = new Uint8Array([1, 2, 3]);

describe('createDiskBlobStore', () => {
  it('deletes every file of the account and none of another user whose id starts the same', async () => {
    // Arrange
    const store = tempBlobStore();
    const own = ['users/abc/documents/one.pdf', 'users/abc/documents/two.jpg'];
    const other = 'users/abcd/documents/three.pdf';
    for (const pathname of [...own, other]) await store.writeDocument(pathname, BYTES);

    // Act
    await store.deleteUserDocuments('abc');

    // Assert
    expect(await store.listPathnames('users/')).toEqual([other]);
  });
});
