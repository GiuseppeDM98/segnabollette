'use client';

import type { ReferenceLine, UnitPricePoint } from '@/lib/charts/series';
import type { ConsumptionUnit } from '@/lib/domain/types';
import { formatUnitPriceValue, UNIT_LABELS } from '@/lib/format';
import { ChartFrame } from './chart-frame';
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_MARGIN,
  ChartTooltipBox,
  GRID_STROKE,
  type LegendItem,
  LINE_CURSOR,
} from './chart-parts';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from './recharts';

const PRICE_LINES = [
  { key: 'commodity', label: 'Materia prima (senza IVA)', color: 'var(--color-price-commodity)' },
  {
    key: 'total',
    label: 'Costo totale per unità (IVA inclusa)',
    color: 'var(--color-price-total)',
  },
] as const;
const REFERENCE_COLORS = ['var(--color-reference-wholesale)', 'var(--color-reference-arera)'];
const DOT_RING = { r: 3, strokeWidth: 2, stroke: 'var(--color-surface)' };

type ChartPoint = UnitPricePoint & Record<string, string | number | null>;

function referenceDataKey(reference: ReferenceLine): string {
  return `reference-${reference.key}`;
}

/**
 * The two unit prices over time, with market references dashed. A month without consumption has
 * no price and stays a gap (no line drawn across it); the dots keep a lone month visible.
 */
export function UnitPriceChart({
  points,
  unit,
  references = [],
  note,
}: {
  points: UnitPricePoint[];
  unit: ConsumptionUnit;
  references?: ReferenceLine[];
  note?: string;
}) {
  const data: ChartPoint[] = points.map((point) => {
    const withReferences: ChartPoint = { ...point };
    for (const reference of references) {
      withReferences[referenceDataKey(reference)] = reference.values[point.month] ?? null;
    }
    return withReferences;
  });
  const referenceSeries = references.map((reference, index) => ({
    key: referenceDataKey(reference),
    label: reference.label,
    color: REFERENCE_COLORS[index % REFERENCE_COLORS.length] ?? 'var(--color-ink-muted)',
    source: reference.source,
  }));
  const priceText = (value: unknown) =>
    typeof value === 'number' ? formatUnitPriceValue(value, unit) : '—';

  const legend: LegendItem[] = [
    ...PRICE_LINES.map((line) => ({ ...line, shape: 'line' as const })),
    ...referenceSeries.map((series) => ({
      key: series.key,
      label: series.label,
      color: series.color,
      shape: 'dashed' as const,
    })),
  ];
  const allSeries = [...PRICE_LINES, ...referenceSeries];
  const columns = [
    { key: 'month', label: 'Mese' },
    ...allSeries.map((series) => ({ key: series.key, label: series.label })),
  ];
  const rows = data.map((point) => ({
    key: point.month,
    cells: [point.label, ...allSeries.map((series) => priceText(point[series.key]))],
  }));

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as ChartPoint | undefined;
    if (!active || !point) return null;
    const tooltipRows = allSeries
      .filter((series) => typeof point[series.key] === 'number')
      .map((series) => ({
        key: series.key,
        label: series.label,
        value: priceText(point[series.key]),
        color: series.color,
      }));
    if (tooltipRows.length === 0) return null;
    return <ChartTooltipBox title={point.label} rows={tooltipRows} />;
  };

  const sources = [...new Set(referenceSeries.map((series) => series.source))];
  return (
    <ChartFrame
      title="Costo unitario"
      subtitle={`€/${UNIT_LABELS[unit]}`}
      legend={legend}
      columns={columns}
      rows={rows}
      notes={
        note || sources.length > 0 ? (
          <div className="flex flex-col gap-1 text-xs text-ink-soft">
            {sources.map((source) => (
              <p key={source}>{source}</p>
            ))}
            {note && <p>{note}</p>}
          </div>
        ) : null
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGIN}>
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
            width={108}
            tickFormatter={(value: number) => formatUnitPriceValue(value, unit)}
          />
          <Tooltip content={renderTooltip} cursor={LINE_CURSOR} isAnimationActive={false} />
          {PRICE_LINES.map((line) => (
            <Line
              key={line.key}
              dataKey={line.key}
              name={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={{ ...DOT_RING, fill: line.color }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
          {referenceSeries.map((series) => (
            <Line
              key={series.key}
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
