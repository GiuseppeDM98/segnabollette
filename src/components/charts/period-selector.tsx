import Link from 'next/link';
import { buttonClass } from '@/components/ui/styles';
import type { DashboardRange } from '@/lib/services/dashboard';

const OPTIONS: ReadonlyArray<{ range: DashboardRange; label: string }> = [
  { range: '12', label: '12 mesi' },
  { range: '24', label: '24 mesi' },
  { range: 'all', label: 'Tutto' },
];

/** The range of the charts below it, as links: the page reads it back from `?periodo=`. */
export function PeriodSelector({
  current,
  hrefFor,
}: {
  current: DashboardRange;
  hrefFor: (range: DashboardRange) => string;
}) {
  return (
    <nav aria-label="Periodo dei grafici" className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => (
        <Link
          key={option.range}
          href={hrefFor(option.range)}
          aria-current={option.range === current ? 'true' : undefined}
          className={buttonClass(option.range === current ? 'primary' : 'secondary', 'text-sm')}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
