import { describe, expect, it } from 'vitest';
import { type QueueItemResult, runQueue, toQueueItemResult } from './queue-runner';

const EXTRACTED: QueueItemResult = { status: 'extracted', errorCode: null, errorMessage: null };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('runQueue', () => {
  it('never runs more than the concurrency at once and completes every id', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const run = async (id: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await delay(id === 'b' ? 30 : 10);
      inFlight -= 1;
      return EXTRACTED;
    };

    const outcome = await runQueue({
      ids: ['a', 'b', 'c', 'd', 'e'],
      concurrency: 2,
      run,
      onUpdate: () => {},
    });

    expect(maxInFlight).toBe(2);
    expect([...outcome.completed].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(outcome.failed).toEqual([]);
    expect(outcome.notStarted).toEqual([]);
    expect(outcome.pausedBecauseUnavailable).toBe(false);
  });

  it('stops starting new runs on the first unavailable answer', async () => {
    const started: string[] = [];
    const run = async (id: string): Promise<QueueItemResult> => {
      started.push(id);
      await delay(10);
      if (id === 'c') {
        return { status: 'failed', errorCode: 'unavailable', errorMessage: 'Servizio giù.' };
      }
      return EXTRACTED;
    };

    const outcome = await runQueue({
      ids: ['a', 'b', 'c', 'd', 'e'],
      concurrency: 2,
      run,
      onUpdate: () => {},
    });

    expect(outcome.pausedBecauseUnavailable).toBe(true);
    expect(outcome.failed).toEqual(['c']);
    expect(outcome.notStarted.length).toBeGreaterThan(0);
    expect(started).not.toContain('e');
  });

  it('goes on after a bill that fails on its own', async () => {
    const run = async (id: string): Promise<QueueItemResult> =>
      id === 'b'
        ? { status: 'failed', errorCode: 'invalid_output', errorMessage: 'Risposta non valida.' }
        : EXTRACTED;

    const outcome = await runQueue({
      ids: ['a', 'b', 'c'],
      concurrency: 2,
      run,
      onUpdate: () => {},
    });

    expect(outcome.pausedBecauseUnavailable).toBe(false);
    expect(outcome.failed).toEqual(['b']);
    expect([...outcome.completed].sort()).toEqual(['a', 'c']);
    expect(outcome.notStarted).toEqual([]);
  });

  it('pauses with «Connessione interrotta.» when a run throws', async () => {
    const updates: Array<[string, 'running' | QueueItemResult]> = [];
    const run = async (): Promise<QueueItemResult> => {
      throw new TypeError('Failed to fetch');
    };

    const outcome = await runQueue({
      ids: ['a', 'b', 'c'],
      concurrency: 1,
      run,
      onUpdate: (id, state) => updates.push([id, state]),
    });

    expect(updates).toEqual([
      ['a', 'running'],
      [
        'a',
        { status: 'failed', errorCode: 'unavailable', errorMessage: 'Connessione interrotta.' },
      ],
    ]);
    expect(outcome.pausedBecauseUnavailable).toBe(true);
    expect(outcome.notStarted).toEqual(['b', 'c']);
  });
});

describe('toQueueItemResult', () => {
  it('reads an extracted answer', () => {
    expect(
      toQueueItemResult(200, { status: 'extracted', errorCode: null, errorMessage: null }),
    ).toEqual(EXTRACTED);
  });

  it('keeps the code of a bill that failed on its own', () => {
    expect(
      toQueueItemResult(200, {
        status: 'failed',
        errorCode: 'invalid_output',
        errorMessage: 'Risposta non valida.',
      }),
    ).toEqual({
      status: 'failed',
      errorCode: 'invalid_output',
      errorMessage: 'Risposta non valida.',
    });
  });

  it('pauses on an expired session', () => {
    expect(toQueueItemResult(401, { code: 'UNAUTHORIZED', message: 'Devi accedere.' })).toEqual({
      status: 'failed',
      errorCode: 'unavailable',
      errorMessage: 'Sessione scaduta: accedi di nuovo e riprendi.',
    });
  });

  it('fails a busy extraction without pausing', () => {
    expect(
      toQueueItemResult(409, {
        code: 'EXTRACTION_BUSY',
        message: 'Questa bolletta è già in lavorazione.',
      }),
    ).toEqual({
      status: 'failed',
      errorCode: 'EXTRACTION_BUSY',
      errorMessage: 'Questa bolletta è già in lavorazione.',
    });
  });

  it('pauses on a 503 with its message', () => {
    expect(
      toQueueItemResult(503, {
        code: 'EXTRACTION_UNAVAILABLE',
        message: 'Estrazione non configurata su questa installazione.',
      }),
    ).toEqual({
      status: 'failed',
      errorCode: 'unavailable',
      errorMessage: 'Estrazione non configurata su questa installazione.',
    });
  });

  it('pauses on a platform timeout whose body is not JSON', () => {
    expect(toQueueItemResult(504, null)).toEqual({
      status: 'failed',
      errorCode: 'unavailable',
      errorMessage: 'Servizio non raggiungibile.',
    });
  });

  it('fails a missing extraction with its code', () => {
    expect(toQueueItemResult(404, { code: 'NOT_FOUND', message: 'Non trovato.' })).toEqual({
      status: 'failed',
      errorCode: 'NOT_FOUND',
      errorMessage: 'Non trovato.',
    });
  });
});
