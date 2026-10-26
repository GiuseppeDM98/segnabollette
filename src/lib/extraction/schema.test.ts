import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ExtractionSchema } from './schema';
import { FIXTURE_EXTRACTIONS_DIR } from './testing/fixture-bills';

const SAFE_INTEGER_BOUNDS = [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];

/** Every node of a JSON schema, walked depth first. */
function* nodes(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* nodes(item);
  } else if (typeof value === 'object' && value !== null) {
    yield value as Record<string, unknown>;
    for (const child of Object.values(value)) yield* nodes(child);
  }
}

describe('ExtractionSchema', () => {
  it('has no union types: absence is a sentinel, not a null', () => {
    const schema = z.toJSONSchema(ExtractionSchema);

    for (const node of nodes(schema)) {
      expect(node).not.toHaveProperty('anyOf');
      expect(node).not.toHaveProperty('oneOf');
      expect(Array.isArray(node.type)).toBe(false);
    }
  });

  it('has no numeric bounds but the safe-integer ones that .int() adds', () => {
    const schema = z.toJSONSchema(ExtractionSchema);

    for (const node of nodes(schema)) {
      for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) {
        if (key in node) expect(SAFE_INTEGER_BOUNDS).toContain(node[key]);
      }
    }
  });

  it('accepts every fixture extraction', () => {
    const files = readdirSync(FIXTURE_EXTRACTIONS_DIR).filter((file) => file.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const json: unknown = JSON.parse(readFileSync(join(FIXTURE_EXTRACTIONS_DIR, file), 'utf8'));
      if (typeof json === 'object' && json !== null && 'fail' in json) continue;
      expect(ExtractionSchema.safeParse(json).success, file).toBe(true);
    }
  });
});
