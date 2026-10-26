/** The bodies of the upload routes: what the browser declares, checked again on the stored bytes. */
import { z } from 'zod';
import { DomainError } from '@/lib/errors';
import { parseInput } from '@/lib/parse-input';

const UploadFileSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  contentType: z.enum(['application/pdf', 'image/jpeg']),
  sizeBytes: z.number().int().positive(),
});

export const CreateExtractionBodySchema = z.object({
  supplyId: z.string().min(1).nullable(),
  batchId: z.string().min(1).max(64).nullable(),
  files: z.array(UploadFileSchema),
});

export const CreateAttachmentBodySchema = z.object({ files: z.array(UploadFileSchema) });

export const AttachmentUploadedBodySchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1).max(10),
});

/** The JSON body checked against its schema; a body that is not JSON is a VALIDATION too. */
export async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new DomainError('VALIDATION', undefined, ['Richiesta non valida.']);
  }
  return parseInput(schema, body);
}
