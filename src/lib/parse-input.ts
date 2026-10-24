import type { z } from 'zod';
import { DomainError } from './errors';

/**
 * The first step of a Server Action: the shape of its arguments. A failure is a VALIDATION with
 * each zod message, the same shape the services use, so the form shows them all.
 */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION',
      undefined,
      parsed.error.issues.map((issue) => issue.message),
    );
  }
  return parsed.data;
}

/** The messages of a server answer to show at the top of a form. */
export function resultMessages(result: { message: string; details?: unknown }): string[] {
  const { details } = result;
  if (Array.isArray(details) && details.every((detail) => typeof detail === 'string')) {
    return details.length > 0 ? details : [result.message];
  }
  return [result.message];
}
