/**
 * Domain errors and their Italian messages. Server Actions return ActionResult instead of
 * throwing across the client boundary; route handlers map codes to HTTP statuses.
 */
export type DomainErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'OVERLAP_DECISION_REQUIRED'
  | 'DUPLICATE_IDENTIFIER'
  | 'DUPLICATE_DOCUMENT'
  | 'DOCUMENT_INVALID'
  | 'EXTRACTION_UNAVAILABLE'
  | 'EXTRACTION_BUSY';

export const ERROR_MESSAGES: Record<DomainErrorCode, string> = {
  UNAUTHORIZED: 'Devi accedere per continuare.',
  NOT_FOUND: 'Non trovato.',
  VALIDATION: 'Alcuni dati non sono validi.',
  OVERLAP_DECISION_REQUIRED:
    'Questa bolletta copre giorni già coperti: scegli se sommarla o se sostituisce quella vecchia.',
  DUPLICATE_IDENTIFIER: 'Hai già una fornitura con questo codice.',
  DUPLICATE_DOCUMENT: 'Questo file è già stato caricato.',
  DOCUMENT_INVALID: 'Il file non è valido.',
  EXTRACTION_UNAVAILABLE: "L'estrazione non è disponibile in questo momento.",
  EXTRACTION_BUSY: 'Questa bolletta è già in lavorazione.',
};

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'DomainError';
  }
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: DomainErrorCode; message: string; details?: unknown };

/** Run a Server Action body and turn a DomainError into a result; anything else is rethrown. */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, code: error.code, message: error.message, details: error.details };
    }
    throw error;
  }
}
