'use client';

import { useState } from 'react';
import { buttonClass } from '@/components/ui/styles';
import { percentChange, type YearLines, type YearOverYearPoint } from '@/lib/charts/series';
import type { ConsumptionUnit } from '@/lib/domain/types';
import {
  formatEuro,
  formatEuroValue,
  formatPeople,
  formatQuantity,
  UNIT_LABELS,
} from '@/lib/format';
import { ChartFrame } from './chart-frame';
import {
  AXIS_LINE,
  AXIS_TICK,
  BAR_CURSOR,
  CHART_MARGIN,
  ChartTooltipBox,
  GRID_STROKE,
  type LegendItem,
  LINE_CURSOR,
  MAX_BAR_SIZE,
} from './chart-parts';
import { KpiTile } from './kpi-tile';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from './recharts';

const CURRENT = { key: 'current', label: "quest'anno", color: 'var(--color-yoy-current)' } as const;
const PREVIOUS = {
  key: 'previous',
  label: 'anno prima',
  color: 'var(--color-yoy-previous)',
} as const;
const SERIES = [CURRENT, PREVIOUS];
const LEGEND: LegendItem[] = SERIES.map((series) => ({ ...series, shape: 'bar' }));

/**
 * The lines of the years, by recency: the current year blue, the year before grey, every older
 * year one lighter grey (two lighter greys side by side cannot be told apart). Each line ends with
 * its year written in ink, so the older years sharing a grey are still told apart.
 */
const YEAR_COLORS = [
  'var(--color-yoy-current)',
  'var(--color-yoy-previous)',
  'var(--color-yoy-older)',
];
const DOT_RING = { r: 3, strokeWidth: 2, stroke: 'var(--color-surface)' };
// The year written after the last point needs more room than half a month label.
const YEAR_LINES_MARGIN = { ...CHART_MARGIN, right: 44 };

type Metric = 'consumption' | 'cost';
type YearLinePoint = YearLines['points'][number];

export interface YearOverYearTotals {
  consumption: { last12: number | null; previous12: number | null; isComparable: boolean } | null;
  cost: { last12Cents: number; previous12Cents: number; isComparable: boolean };
  /**
   * The people in the house over the same 12 months and over the 12 before (day-weighted
   * averages); the per-person tiles show only when `last12` is known.
   */
  people?: { last12: number | null; previous12: number | null } | null;
}

/** A 12-month figure per person, and its change on the 12 months before per person. */
function perPerson(
  last12: number | null,
  previous12: number | null,
  people: { last12: number; previous12: number | null },
  isComparable: boolean,
): { value: number | null; change: number | null } {
  const value = last12 === null ? null : last12 / people.last12;
  const previous =
    previous12 === null || people.previous12 === null ? null : previous12 / people.previous12;
  return { value, change: tileChange(value, previous, isComparable) };
}

/** The change is shown only when the two periods are comparable and both have a value. */
function tileChange(last12: number | null, previous12: number | null, isComparable: boolean) {
  if (!isComparable || last12 === null || previous12 === null) return null;
  return percentChange(last12, previous12);
}

function yearColor(index: number): string {
  return YEAR_COLORS[Math.min(index, YEAR_COLORS.length - 1)] ?? 'var(--color-yoy-older)';
}

interface YearEndLabelProps {
  x?: unknown;
  y?: unknown;
  index?: unknown;
  year: number;
  lastIndex: number;
}

/** The year written after the last point of its line, in ink: the line's colour is the identity. */
function YearEndLabel({ x, y, index, year, lastIndex }: YearEndLabelProps) {
  if (index !== lastIndex || typeof x !== 'number' || typeof y !== 'number') return null;
  return (
    <text
      x={x + 8}
      y={y}
      dominantBaseline="middle"
      fontSize={12}
      fill="var(--color-ink-soft)"
      // A halo of the surface keeps the year legible where it crosses another year's line.
      stroke="var(--color-surface)"
      strokeWidth={4}
      paintOrder="stroke"
      className="figures"
    >
      {year}
    </text>
  );
}

/** One line per calendar year, January to December, the current year drawn last (on top). */
function YearLinesPlot({
  lines,
  valueText,
  yAxisWidth,
}: {
  lines: YearLines;
  valueText: (value: number | null) => string;
  yAxisWidth: number;
}) {
  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as YearLinePoint | undefined;
    if (!active || !point) return null;
    const rows = lines.years
      .map((year, index) => ({ year, index, value: point.values[year] ?? null }))
      .filter((row) => row.value !== null)
      .map((row) => ({
        key: String(row.year),
        label: String(row.year),
        value: valueText(row.value),
        color: yearColor(row.index),
      }));
    if (rows.length === 0) return null;
    return <ChartTooltipBox title={point.label} rows={rows} />;
  };
  const drawOrder = lines.years.map((year, index) => ({ year, index })).reverse();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={lines.points} margin={YEAR_LINES_MARGIN}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={AXIS_LINE}
          interval="preserveStartEnd"
          minTickGap={8}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth}
          tickFormatter={(value: number) => valueText(value)}
        />
        <Tooltip content={renderTooltip} cursor={LINE_CURSOR} isAnimationActive={false} />
        {drawOrder.map(({ year, index }) => {
          const lastIndex = lines.points.findLastIndex((point) => point.values[year] != null);
          const color = yearColor(index);
          return (
            <Line
              key={year}
              dataKey={(point: YearLinePoint) => point.values[year] ?? null}
              name={String(year)}
              stroke={color}
              strokeWidth={2}
              dot={{ ...DOT_RING, fill: color }}
              connectNulls={false}
              label={(props: Omit<YearEndLabelProps, 'year' | 'lastIndex'>) => (
                <YearEndLabel {...props} year={year} lastIndex={lastIndex} />
              )}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Over «12 mesi», the 12 months ending at the last billed month beside the same months a year
 * earlier, as bars; over «24 mesi» and «Tutto» (`yearLines`), one line per calendar year of the
 * months shown. The «Ultimi 12 mesi» tiles above stay on the last 12 billed months whatever the
 * range. Metered supplies switch between consumption and spending; flat fees have spending only.
 */
export function YearOverYearChart({
  consumption,
  cost,
  unit,
  totals,
  yearLines,
}: {
  consumption: YearOverYearPoint[] | null;
  cost: YearOverYearPoint[];
  unit: ConsumptionUnit | null;
  totals: YearOverYearTotals;
  yearLines?: { consumption: YearLines | null; cost: YearLines };
}) {
  const [metric, setMetric] = useState<Metric>(consumption ? 'consumption' : 'cost');
  const consumptionUnit = metric === 'consumption' && consumption !== null ? unit : null;
  const isConsumption = consumptionUnit !== null;
  const points = isConsumption && consumption ? consumption : cost;
  const lines = yearLines
    ? ((isConsumption ? yearLines.consumption : null) ?? yearLines.cost)
    : null;
  const valueText = (value: number | null) => {
    if (value === null) return '—';
    return consumptionUnit ? formatQuantity(value, consumptionUnit) : formatEuroValue(value);
  };
  const yAxisWidth = isConsumption ? 72 : 80;

  const columns = lines
    ? [
        { key: 'month', label: 'Mese' },
        ...lines.years.map((year) => ({ key: String(year), label: String(year) })),
      ]
    : [
        { key: 'month', label: 'Mese' },
        { key: CURRENT.key, label: "Quest'anno" },
        { key: PREVIOUS.key, label: 'Anno prima' },
      ];
  const rows = lines
    ? lines.points.map((point) => ({
        key: String(point.monthNumber),
        cells: [point.label, ...lines.years.map((year) => valueText(point.values[year] ?? null))],
      }))
    : points.map((point) => ({
        key: point.month,
        cells: [point.label, valueText(point.current), valueText(point.previous)],
      }));
  const legend: LegendItem[] = lines
    ? lines.years.map((year, index) => ({
        key: String(year),
        label: String(year),
        color: yearColor(index),
        shape: 'line',
      }))
    : LEGEND;
  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as YearOverYearPoint | undefined;
    if (!active || !point) return null;
    return (
      <ChartTooltipBox
        title={point.label}
        rows={SERIES.map((series) => ({
          key: series.key,
          label: series.label,
          value: valueText(point[series.key]),
          color: series.color,
        }))}
      />
    );
  };

  const consumptionTotals = totals.consumption;
  const people =
    totals.people?.last12 != null
      ? { last12: totals.people.last12, previous12: totals.people.previous12 }
      : null;
  const consumptionPerPerson =
    people && consumptionTotals
      ? perPerson(
          consumptionTotals.last12,
          consumptionTotals.previous12,
          people,
          consumptionTotals.isComparable,
        )
      : null;
  const costPerPerson = people
    ? perPerson(
        totals.cost.last12Cents,
        totals.cost.previous12Cents,
        people,
        totals.cost.isComparable,
      )
    : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {consumptionTotals && unit && (
          <KpiTile
            label="Ultimi 12 mesi · consumo"
            value={
              consumptionTotals.last12 === null
                ? '—'
                : formatQuantity(consumptionTotals.last12, unit)
            }
            change={tileChange(
              consumptionTotals.last12,
              consumptionTotals.previous12,
              consumptionTotals.isComparable,
            )}
          />
        )}
        <KpiTile
          label="Ultimi 12 mesi · spesa"
          value={formatEuro(totals.cost.last12Cents)}
          change={tileChange(
            totals.cost.last12Cents,
            totals.cost.previous12Cents,
            totals.cost.isComparable,
          )}
        />
        {people && consumptionPerPerson && unit && (
          <KpiTile
            label="Ultimi 12 mesi · consumo per persona"
            value={
              consumptionPerPerson.value === null
                ? '—'
                : formatQuantity(Math.round(consumptionPerPerson.value), unit)
            }
            change={consumptionPerPerson.change}
            note={formatPeople(people.last12)}
          />
        )}
        {people && costPerPerson && (
          <KpiTile
            label="Ultimi 12 mesi · spesa per persona"
            value={formatEuro(Math.round(costPerPerson.value ?? 0))}
            change={costPerPerson.change}
            note={formatPeople(people.last12)}
          />
        )}
      </div>
      <ChartFrame
        title="Anno su anno"
        subtitle={consumptionUnit ? UNIT_LABELS[consumptionUnit] : '€, IVA inclusa'}
        legend={legend}
        columns={columns}
        rows={rows}
        controls={
          consumption && (
            <fieldset className="flex gap-2">
              <legend className="sr-only">Che cosa confrontare</legend>
              {(['consumption', 'cost'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={metric === option}
                  onClick={() => setMetric(option)}
                  className={buttonClass(metric === option ? 'primary' : 'secondary', 'text-sm')}
                >
                  {option === 'consumption' ? 'Consumo' : 'Spesa'}
                </button>
              ))}
            </fieldset>
          )
        }
      >
        {lines ? (
          <YearLinesPlot lines={lines} valueText={valueText} yAxisWidth={yAxisWidth} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={CHART_MARGIN} barGap={2}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={AXIS_LINE}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={yAxisWidth}
                tickFormatter={(value: number) => valueText(value)}
              />
              <Tooltip content={renderTooltip} cursor={BAR_CURSOR} isAnimationActive={false} />
              {SERIES.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  fill={series.color}
                  maxBarSize={MAX_BAR_SIZE / 2}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>
    </div>
  );
}
