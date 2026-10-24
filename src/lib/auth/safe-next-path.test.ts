import { describe, expect, it } from 'vitest';
import { safeNextPath } from './public-paths';

describe('safeNextPath', () => {
  it('keeps an internal path with its query', () => {
    expect(safeNextPath('/bollette?x=1')).toBe('/bollette?x=1');
  });

  it.each([
    ['a protocol-relative URL', '//evil'],
    ['an absolute URL', 'https://evil'],
    ['a backslash path', '/\\evil'],
    ['null', null],
  ])('falls back to / for %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBe('/');
  });
});
