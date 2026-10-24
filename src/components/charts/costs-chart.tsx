'use client';

import { useId } from 'react';
import type { CostPoint } from '@/lib/charts/series';
import { CATEGORY_LABELS, formatEuroValue } from '@/lib/format';
import { ChartFrame } from './chart-frame';
import {
  AXIS_LINE,
  AXIS_TICK,
  BAR_CURSOR,
  CHART_MARGIN,
  ChartTooltipBox,
  GRID_STROKE,
  HatchPattern,
  type LegendItem,
  MAX_BAR_SIZE,
  SEGMENT_GAP,
  ZERO_LINE_STROKE,
} from './chart-parts';
import {
  Bar,
  BarChart,
  CartesianGrid,
  RechartsReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from './recharts';

type CostKey = Exclude<keyof CostPoint, 'month' | 'label'>;

interface CostSeries {
  key: CostKey;
  label: string;
  color: string;
}

const CATEGORY_SERIES: readonly CostSeries[] = [
  { key: 'commodity', label: CATEGORY_LABELS.commodity, color: 'var(--color-cat-commodity)' },
  { key: 'sale', label: CATEGORY_LABELS.sale, color: 'var(--color-cat-sale)' },
  { key: 'network', label: CATEGORY_LABELS.network, color: 'var(--color-cat-network)' },
  { key: 'system', label: CATEGORY_LABELS.system, color: 'var(--color-cat-system)' },
  { key: 'excise', label: CATEGORY_LABELS.excise, color: 'var(--color-cat-excise)' },
  { key: 'vat', label: CATEGORY_LABELS.vat, color: 'var(--color-cat-vat)' },
  { key: 'other', label: CATEGORY_LABELS.other, color: 'var(--color-cat-other)' },
];
const FLAT: CostSeries = { key: 'flat', label: 'Canoni e tributi', color: 'var(--color-cat-flat)' };
const FEED_IN: CostSeries = {
  key: 'feedIn',
  label: CATEGORY_LABELS.feed_in,
  color: 'var(--color-cat-feed-in)',
};
const TOTAL: CostSeries = { key: 'total', label: 'Totale', color: 'var(--color-cat-flat)' };

/** What each mode stacks: a supply by category, a flat fee as its total, the house with both. */
function seriesOf(mode: 'supply' | 'flat' | 'house'): CostSeries[] {
  switch (mode) {
    case 'flat':
      return [TOTAL];
    case 'house':
      return [...CATEGORY_SERIES, FLAT, FEED_IN];
    default:
      return [...CATEGORY_SERIES, FEED_IN];
  }
}

/**
 * Costs per month by category. With stackOffset="sign" negative segments (the fed-in credit,
 * discounts in «Altre partite», negative system charges, a month whose recalculations sum below
 * zero) stack down from zero and positive ones up from zero; with the default offset a negative
 * value would start from the top of the pile and cover the positive segments. The «Totale» of a
 * month is net of the fed-in credit.
 */
export function CostsChart({
  points,
  mode,
}: {
  points: CostPoint[];
  mode: 'supply' | 'flat' | 'house';
}) {
  // The id names SVG patterns used as url(#…): keep only characters safe in a fragment.
  const patternId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const series = seriesOf(mode).filter(
    (entry) => entry.key === 'total' || points.some((point) => point[entry.key] !== 0),
  );
  const fillOf = (entry: CostSeries) =>
    entry.key === 'feedIn' ? `url(#${patternId}-feed-in)` : entry.color;
  const legend: LegendItem[] =
    mode === 'flat'
      ? []
      : series.map((entry) => ({
          ...entry,
          shape: entry.key === 'feedIn' ? ('hatched' as const) : ('bar' as const),
        }));
  const stacked = series.filter((entry) => entry.key !== 'total');
  const columns = [
    { key: 'month', label: 'Mese' },
    ...stacked.map((entry) => ({ key: entry.key, label: entry.label })),
    { key: 'total', label: 'Totale' },
  ];
  const rows = points.map((point) => ({
    key: point.month,
    cells: [
      point.label,
      ...stacked.map((entry) => formatEuroValue(point[entry.key])),
      formatEuroValue(point.total),
    ],
  }));

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as CostPoint | undefined;
    if (!active || !point) return null;
    const segmentRows = stacked
      .filter((entry) => point[entry.key] !== 0)
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        value: formatEuroValue(point[entry.key]),
        color: entry.color,
      }));
    return (
      <ChartTooltipBox
        title={point.label}
        rows={[
          ...segmentRows,
          { key: 'total', label: 'Totale', value: formatEuroValue(point.total) },
        ]}
      />
    );
  };

  return (
    <ChartFrame
      title="Costi per categoria"
      subtitle="€, IVA inclusa"
      legend={legend}
      columns={columns}
      rows={rows}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} stackOffset="sign" margin={CHART_MARGIN}>
          <defs>
            <HatchPattern id={`${patternId}-feed-in`} color={FEED_IN.color} />
          </defs>
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
            width={80}
            tickFormatter={(value: number) => formatEuroValue(value)}
          />
          <Tooltip content={renderTooltip} cursor={BAR_CURSOR} isAnimationActive={false} />
          <RechartsReferenceLine y={0} stroke={ZERO_LINE_STROKE} />
          {(mode === 'flat' ? series : stacked).map((entry) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              name={entry.label}
              stackId="costs"
              fill={fillOf(entry)}
              maxBarSize={MAX_BAR_SIZE}
              isAnimationActive={false}
              {...SEGMENT_GAP}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
