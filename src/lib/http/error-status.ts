/**
 * Route handlers answer a DomainError with its status and its Italian message. The Record is
 * exhaustive on purpose: a new error code without a status fails the type check.
 */
import { DomainError, type DomainErrorCode } from '@/lib/errors';

export const ERROR_STATUS: Record<DomainErrorCode, number> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  VALIDATION: 400,
  OVERLAP_DECISION_REQUIRED: 409,
  DUPLICATE_IDENTIFIER: 409,
  DUPLICATE_DOCUMENT: 409,
  DOCUMENT_INVALID: 422,
  EXTRACTION_UNAVAILABLE: 503,
  EXTRACTION_BUSY: 409,
};

/** A DomainError as JSON `{ code, message, details }`; anything else is a 500 without details. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    return Response.json(
      { code: error.code, message: error.message, details: error.details },
      { status: ERROR_STATUS[error.code] },
    );
  }
  console.error('Unexpected error in a route handler', error);
  return Response.json(
    { code: 'INTERNAL', message: 'Errore inatteso: riprova più tardi.' },
    { status: 500 },
  );
}
