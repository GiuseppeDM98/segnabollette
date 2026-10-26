/**
 * The queue of a bulk import, driven by the browser: Vercel Hobby has no long background job, so
 * each extraction is one call to POST /api/extractions/<id>/run and the state lives in the
 * database. At most `concurrency` runs at a time, stopping new starts on the first failure that
 * means "the service is down", so a rate limit does not burn through the whole batch. Pausing is
 * the opposite of a retry: nothing is run again until the owner clicks «Riprendi».
 */
export interface QueueItemResult {
  status: 'extracted' | 'failed';
  /** An extraction error code, a domain error code, or 'unavailable' for anything that must pause. */
  errorCode: string | null;
  errorMessage: string | null;
}

export interface QueueRunnerOptions {
  ids: readonly string[];
  concurrency: number;
  run: (id: string) => Promise<QueueItemResult>;
  onUpdate: (id: string, state: 'running' | QueueItemResult) => void;
}

export interface QueueRunOutcome {
  completed: string[];
  failed: string[];
  notStarted: string[];
  pausedBecauseUnavailable: boolean;
}

export async function runQueue(options: QueueRunnerOptions): Promise<QueueRunOutcome> {
  const pending = [...options.ids];
  const outcome: QueueRunOutcome = {
    completed: [],
    failed: [],
    notStarted: [],
    pausedBecauseUnavailable: false,
  };

  async function worker(): Promise<void> {
    while (pending.length > 0 && !outcome.pausedBecauseUnavailable) {
      const id = pending.shift();
      if (!id) return;
      options.onUpdate(id, 'running');
      // A fetch that throws (network down, page leaving) pauses the queue like an unavailable service.
      const result = await options.run(id).catch(
        (): QueueItemResult => ({
          status: 'failed',
          errorCode: 'unavailable',
          errorMessage: 'Connessione interrotta.',
        }),
      );
      options.onUpdate(id, result);
      if (result.status === 'extracted') outcome.completed.push(id);
      else {
        outcome.failed.push(id);
        if (result.errorCode === 'unavailable') outcome.pausedBecauseUnavailable = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, () => worker()));
  outcome.notStarted = pending;
  return outcome;
}

/**
 * Translate the HTTP answer of POST /api/extractions/<id>/run. Every answer that means "try again
 * later" (expired session, server errors, a body that is not JSON such as a platform timeout page)
 * becomes 'unavailable', which pauses the queue; a busy or missing extraction fails on its own.
 */
export function toQueueItemResult(httpStatus: number, body: unknown): QueueItemResult {
  const fields =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  const text = (key: string): string | null => {
    const value = fields?.[key];
    return typeof value === 'string' ? value : null;
  };
  const status = fields?.status;
  if (httpStatus === 200 && (status === 'extracted' || status === 'failed')) {
    return { status, errorCode: text('errorCode'), errorMessage: text('errorMessage') };
  }
  if (httpStatus === 401) {
    return {
      status: 'failed',
      errorCode: 'unavailable',
      errorMessage: 'Sessione scaduta: accedi di nuovo e riprendi.',
    };
  }
  if (httpStatus >= 500 || fields === null) {
    return {
      status: 'failed',
      errorCode: 'unavailable',
      errorMessage: text('message') ?? 'Servizio non raggiungibile.',
    };
  }
  return { status: 'failed', errorCode: text('code'), errorMessage: text('message') };
}
