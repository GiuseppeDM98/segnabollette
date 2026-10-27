'use client';

import { useId } from 'react';
import type { CostPoint } from '@/lib/charts/series';
import type { HouseholdMonth } from '@/lib/engine';
import { CATEGORY_LABELS, formatEuroValue, formatPeople } from '@/lib/format';
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
const MARK_STROKE = 'var(--color-ink-muted)';
const MARK_LABEL = { fill: 'var(--color-ink-soft)', fontSize: 11 };
// Room above the plot for the marks' labels, so they never sit on the bars.
const MARKED_MARGIN = { ...CHART_MARGIN, top: 24 };

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
 *
 * With a household, a thin dashed line marks each month where the people in the house changed
 * («3 persone»), and the data table gets a column of the people at each month's end.
 */
export function CostsChart({
  points,
  mode,
  household,
}: {
  points: CostPoint[];
  mode: 'supply' | 'flat' | 'house';
  /** One entry per point, same months; absent when the house has no household. */
  household?: HouseholdMonth[];
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
  const peopleByMonth = new Map(household?.map((month) => [month.month, month]));
  const marks = points.flatMap((point) => {
    const last = peopleByMonth.get(point.month)?.changes.at(-1);
    return last ? [{ label: point.label, text: formatPeople(last.people) }] : [];
  });
  const columns = [
    { key: 'month', label: 'Mese' },
    ...stacked.map((entry) => ({ key: entry.key, label: entry.label })),
    { key: 'total', label: 'Totale' },
    ...(household ? [{ key: 'people', label: 'Persone in casa' }] : []),
  ];
  const rows = points.map((point) => {
    const people = peopleByMonth.get(point.month)?.people ?? null;
    return {
      key: point.month,
      cells: [
        point.label,
        ...stacked.map((entry) => formatEuroValue(point[entry.key])),
        formatEuroValue(point.total),
        ...(household ? [people === null ? '—' : String(people)] : []),
      ],
    };
  });

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
        <BarChart
          data={points}
          stackOffset="sign"
          margin={marks.length > 0 ? MARKED_MARGIN : CHART_MARGIN}
        >
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
          {marks.map((mark) => (
            <RechartsReferenceLine
              key={mark.label}
              x={mark.label}
              stroke={MARK_STROKE}
              strokeDasharray="3 3"
              label={{ value: mark.text, position: 'top', ...MARK_LABEL }}
            />
          ))}
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
