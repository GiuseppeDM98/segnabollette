import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './use-wake-lock';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function Probe({ active }: { active: boolean }) {
  useWakeLock(active);
  return null;
}

/** A navigator.wakeLock whose request resolves to a sentinel with a spied release, or rejects. */
function fakeWakeLock(options: { refuse?: boolean } = {}) {
  const release = vi.fn(async () => {});
  const request = vi.fn(async (_type: string) => {
    if (options.refuse) throw new DOMException('Not allowed', 'NotAllowedError');
    return { release } as unknown as WakeLockSentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, release };
}

describe('useWakeLock', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('asks for the screen lock once when active', async () => {
    const { request } = fakeWakeLock();

    await act(async () => root.render(createElement(Probe, { active: true })));

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('releases the lock when it is no longer active', async () => {
    const { release } = fakeWakeLock();
    await act(async () => root.render(createElement(Probe, { active: true })));

    await act(async () => root.render(createElement(Probe, { active: false })));

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('ignores a refused request', async () => {
    const { request } = fakeWakeLock({ refuse: true });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    await act(async () => root.render(createElement(Probe, { active: true })));
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', unhandled);
    expect(request).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
