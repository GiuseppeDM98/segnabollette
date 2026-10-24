'use client';

import { useRouter } from 'next/navigation';
import { inputClass, labelClass } from '@/components/ui/styles';

/** The supply filter of the bill list: changing it opens page 1 of that supply. */
export function BillSupplyFilter({
  supplies,
  selectedId,
}: {
  supplies: Array<{ id: string; label: string }>;
  selectedId: string | null;
}) {
  const router = useRouter();
  return (
    <div className="max-w-xs">
      <label htmlFor="bill-supply-filter" className={`${labelClass} mb-1`}>
        Fornitura
      </label>
      <select
        id="bill-supply-filter"
        value={selectedId ?? ''}
        onChange={(event) =>
          router.push(
            event.target.value === ''
              ? '/bollette'
              : `/bollette?fornitura=${encodeURIComponent(event.target.value)}`,
          )
        }
        className={inputClass}
      >
        <option value="">Tutte</option>
        {supplies.map((supply) => (
          <option key={supply.id} value={supply.id}>
            {supply.label}
          </option>
        ))}
      </select>
    </div>
  );
}
