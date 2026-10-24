'use client';

import { useRouter } from 'next/navigation';

/**
 * The house name on the cover band, as a selector when there is more than one house. Switching
 * house keeps the chart period (`periodo`) the page was showing.
 */
export function HouseSelect({
  houses,
  selectedId,
  periodo,
}: {
  houses: Array<{ id: string; name: string }>;
  selectedId: string;
  periodo?: string;
}) {
  const router = useRouter();
  const periodQuery = periodo === undefined ? '' : `&periodo=${encodeURIComponent(periodo)}`;
  return (
    <div className="relative">
      <label htmlFor="house-select" className="sr-only">
        Casa
      </label>
      <select
        id="house-select"
        value={selectedId}
        onChange={(event) =>
          router.push(`/?casa=${encodeURIComponent(event.target.value)}${periodQuery}`)
        }
        className="w-full appearance-none rounded-xs bg-transparent py-1 pr-8 text-2xl font-extrabold text-on-brand focus-visible:outline-on-brand"
      >
        {houses.map((house) => (
          <option key={house.id} value={house.id} className="bg-surface text-base text-ink">
            {house.name}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute top-1/2 right-1 size-5 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
