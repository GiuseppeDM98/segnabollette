'use client';

import { useEffect } from 'react';

/**
 * Marks <body data-hydrated> once React has taken over the page. Playwright waits for it before
 * typing into a form: a form filled before hydration submits natively and loses its handler.
 */
export function HydrationMark() {
  useEffect(() => {
    document.body.dataset.hydrated = '';
  }, []);
  return null;
}
