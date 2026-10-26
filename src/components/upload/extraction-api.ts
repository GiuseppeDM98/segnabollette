'use client';

import type { ExtractionErrorCode, ExtractionStatus } from '@/lib/domain/types';
import { resultMessages } from '@/lib/parse-input';

/** A route's answer: its JSON on success, or the `{ code, message, details }` of a DomainError. */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string; details?: unknown };

const NETWORK_ERROR = 'Connessione non riuscita: controlla la rete e riprova.';

export async function postJson<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, code: 'NETWORK', message: NETWORK_ERROR };
  }
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text === '' ? null : JSON.parse(text);
  } catch {
    json = null;
  }
  if (response.ok) return { ok: true, status: response.status, data: json as T };
  const error = (json ?? {}) as { code?: string; message?: string; details?: unknown };
  return {
    ok: false,
    status: response.status,
    code: error.code ?? 'INTERNAL',
    message: error.message ?? 'Errore inatteso: riprova più tardi.',
    details: error.details,
  };
}

/** The messages of a failed answer, one per line (a VALIDATION lists every reason). */
export function apiMessages(result: { message: string; details?: unknown }): string[] {
  return resultMessages(result);
}

export interface RunAnswer {
  status: ExtractionStatus;
  errorCode: ExtractionErrorCode | null;
  errorMessage: string | null;
}

/** The paid call, at the owner's click on «Estrai» or «Riprova». */
export function requestRun(extractionId: string): Promise<ApiResult<RunAnswer>> {
  return postJson<RunAnswer>(`/api/extractions/${extractionId}/run`);
}
