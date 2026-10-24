/**
 * Static guard of per-user isolation: every function a repository exports takes `(db: Db,
 * userId: string, …)`, so no query can be written without the user in hand.
 *
 * It reads the source text instead of importing the modules: a signature is what has to be
 * checked, and the text is the only place where the parameter names survive. A repository exports
 * only `function` declarations (and types): any exported `const`, `let` or `var` fails, because a
 * function behind one — an arrow with a type annotation, a wrapped arrow — has no parameter list
 * this check can find.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPOSITORIES_DIR = __dirname;
// Market data has no user rows: the one declared exception.
const EXEMPT_FILES = new Set(['reference-prices.ts']);
const REQUIRED_PREFIX = '(db:Db,userId:string';

/** The parameter list from its opening parenthesis to the one that closes it. */
function parameterList(source: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0) return source.slice(openIndex, index + 1);
  }
  return source.slice(openIndex);
}

/**
 * The index of the parenthesis that opens the parameters, skipping type parameters however deeply
 * nested (`<T extends Record<string, unknown>>`); the `>` of an arrow type (`=>`) is not a closer.
 */
function parametersOpenIndex(source: string, fromIndex: number): number {
  let angleDepth = 0;
  for (let index = fromIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '<') angleDepth += 1;
    if (char === '>' && source[index - 1] !== '=') angleDepth -= 1;
    if (char === '(' && angleDepth === 0) return index;
  }
  return -1;
}

/** Names of the exports that are not a function starting with `(db: Db, userId: string`. */
function nonConformingExports(source: string): string[] {
  const offenders: string[] = [];
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    const openIndex = parametersOpenIndex(source, (match.index ?? 0) + match[0].length);
    const parameters = openIndex === -1 ? '' : parameterList(source, openIndex).replace(/\s+/g, '');
    if (!parameters.startsWith(REQUIRED_PREFIX)) offenders.push(match[1] ?? '?');
  }
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) {
    offenders.push(match[1] ?? '?');
  }
  return offenders;
}

describe('repository scope', () => {
  it('requires (db: Db, userId: string, …) on every exported repository function', () => {
    const files = readdirSync(REPOSITORIES_DIR).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !EXEMPT_FILES.has(file),
    );

    const offenders = files.flatMap((file) =>
      nonConformingExports(readFileSync(join(REPOSITORIES_DIR, file), 'utf8')).map(
        (name) => `${file}: ${name}`,
      ),
    );

    expect(offenders).toEqual([]);
  });

  it('tells conforming signatures from non-conforming ones', () => {
    expect(nonConformingExports('export async function listAll(db: Db) {}')).toEqual(['listAll']);
    expect(
      nonConformingExports('export const listAll = async (db: Db, userId: string) => []'),
    ).toEqual(['listAll']);
    expect(
      nonConformingExports('export async function listAll(\n  db: Db,\n  userId: string,\n) {}'),
    ).toEqual([]);
  });

  it('sees through type annotations, wrappers and nested type parameters', () => {
    expect(
      nonConformingExports('export const listAll: (db: Db) => Promise<Row[]> = async (db) => []'),
    ).toEqual(['listAll']);
    expect(nonConformingExports('export const listAll = withRetry(async (db: Db) => [])')).toEqual([
      'listAll',
    ]);
    expect(
      nonConformingExports('export function listAll<T extends Record<string, unknown>>(db: Db) {}'),
    ).toEqual(['listAll']);
    expect(
      nonConformingExports(
        'export function listAll<T extends Record<string, () => void>>(db: Db, userId: string) {}',
      ),
    ).toEqual([]);
  });
});
