import { type ReactNode, useId } from 'react';
import { columnHeaderClass, panelClass } from '@/components/ui/styles';
import { ChartLegend, type LegendItem } from './chart-parts';

const SUMMARY_CLASS = 'flex min-h-11 cursor-pointer items-center font-semibold text-link';

export interface ChartColumn {
  key: string;
  label: string;
}

export interface ChartRow {
  key: string;
  /** One already formatted text per column; the first is the month. */
  cells: string[];
}

/**
 * The frame around every chart: title and unit, the plot at a fixed height (a ResponsiveContainer
 * in a parent without one draws nothing), the legend, notes, an optional «Come si legge» for a
 * chart whose lines need explaining, and the same numbers as a table behind «Vedi i dati» — the
 * accessible alternative, and the place for values the plot only shows on hover.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  columns,
  rows,
  controls,
  notes,
  guide,
  children,
}: {
  title: string;
  subtitle: string;
  legend: LegendItem[];
  columns: ChartColumn[];
  rows: ChartRow[];
  controls?: ReactNode;
  notes?: ReactNode;
  guide?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      data-testid="chart-frame"
      aria-labelledby={titleId}
      className={`${panelClass} flex min-w-0 flex-col gap-3 p-4`}
    >
      <div>
        <h2 id={titleId} className="text-base font-bold">
          {title}
        </h2>
        <p className="text-xs text-ink-soft">{subtitle}</p>
      </div>
      {controls}
      <div className="h-60 md:h-80">{children}</div>
      <ChartLegend items={legend} />
      {notes}
      {guide && (
        <details>
          <summary className={SUMMARY_CLASS}>Come si legge</summary>
          {guide}
        </details>
      )}
      <details>
        <summary className={SUMMARY_CLASS}>Vedi i dati</summary>
        {/* Why focusable: with many series the table scrolls sideways, and a keyboard must reach it. */}
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs the focus */}
        <section aria-label={`Dati: ${title}`} tabIndex={0} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={columnHeaderClass}>
                {columns.map((column, index) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-2 pb-1.5 ${index === 0 ? 'text-left' : 'text-right'}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-rule">
                  {row.cells.map((cell, index) =>
                    index === 0 ? (
                      <th
                        key={columns[index]?.key ?? index}
                        scope="row"
                        className="figures px-2 py-1.5 text-left font-bold whitespace-nowrap"
                      >
                        {cell}
                      </th>
                    ) : (
                      <td
                        key={columns[index]?.key ?? index}
                        className="figures px-2 py-1.5 text-right whitespace-nowrap"
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </details>
    </section>
  );
}
