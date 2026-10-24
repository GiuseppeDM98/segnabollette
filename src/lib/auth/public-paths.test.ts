import { describe, expect, it } from 'vitest';
import { isPublicPath } from './public-paths';

describe('isPublicPath', () => {
  it.each(['/accedi', '/registrati/x', '/offline'])('treats %s as public', (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(['/', '/bollette', '/accedi-x'])('treats %s as protected', (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });
});
