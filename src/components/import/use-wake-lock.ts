'use client';

import { useEffect } from 'react';

/**
 * Keep the screen on while `active`: a bulk import runs from the browser for tens of minutes, and
 * a phone that turns its screen off stops the page. The browser drops the lock whenever the page
 * is hidden, so it is asked again when the page comes back. Without the API (or when the request
 * is refused: permission, battery saver) nothing happens and the queue runs all the same.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    async function request(): Promise<void> {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (released) {
          await lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Why ignored: the lock is a comfort, not a condition of the queue.
      }
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible') void request();
    }

    void request();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const lock = sentinel;
      sentinel = null;
      lock?.release().catch(() => {
        // Already released by the browser when the page was hidden.
      });
    };
  }, [active]);
}
