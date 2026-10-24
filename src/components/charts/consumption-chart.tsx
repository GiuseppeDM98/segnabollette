'use client';

import { useId } from 'react';
import type { ConsumptionPoint } from '@/lib/charts/series';
import type { ConsumptionUnit } from '@/lib/domain/types';
import { formatQuantity, UNIT_LABELS } from '@/lib/format';
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
  StripePattern,
  type TooltipRow,
} from './chart-parts';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from './recharts';

type BandKey = 'F1' | 'F2' | 'F3' | 'F23' | 'single';

const BANDS: ReadonlyArray<{ key: BandKey; color: string }> = [
  { key: 'F1', color: 'var(--color-band-f1)' },
  { key: 'F2', color: 'var(--color-band-f2)' },
  { key: 'F3', color: 'var(--color-band-f3)' },
  { key: 'F23', color: 'var(--color-band-f23)' },
  { key: 'single', color: 'var(--color-band-single)' },
];
const READINGS_COLOR = 'var(--color-readings)';
const SELF_COLOR = 'var(--color-pv-self)';
const FEED_IN_COLOR = 'var(--color-pv-feed-in)';
const ESTIMATED_OPACITY = 0.55;
const READINGS_LABEL = 'da letture, non ancora fatturato';
const CONVERSION_NOTE =
  'Coefficiente C non noto: i m³ delle autoletture sono convertiti con C = 1.';

/** A bill without bands is «Fascia unica» for electricity, plain «Consumo» for gas and water. */
function bandLabel(key: BandKey, unit: ConsumptionUnit): string {
  if (key !== 'single') return key;
  return unit === 'kWh' ? 'Fascia unica' : 'Consumo';
}

interface Series {
  key: keyof ConsumptionPoint;
  label: string;
  color: string;
}

/** The series that have at least one value in the range, in stacking order. */
function presentSeries(
  points: ConsumptionPoint[],
  unit: ConsumptionUnit,
  hasPhotovoltaic: boolean,
) {
  const has = (key: keyof ConsumptionPoint) => points.some((point) => point[key] !== null);
  const bands: Series[] = BANDS.filter((band) => has(band.key)).map((band) => ({
    key: band.key,
    label: bandLabel(band.key, unit),
    color: band.color,
  }));
  return {
    bands,
    fromReadings: has('fromReadings'),
    selfConsumption: hasPhotovoltaic && has('selfConsumption'),
    feedIn: hasPhotovoltaic && has('feedIn'),
    isAnyEstimated: points.some((point) => point.isEstimated),
  };
}

function quantityText(value: number | null, unit: ConsumptionUnit): string {
  return value === null ? '—' : formatQuantity(value, unit);
}

/**
 * Consumption per month: billed bands stacked, then the consumption measured by readings after
 * the last bill (striped, same stack), photovoltaic self-consumption on the stack and the energy
 * fed into the grid as a line. Estimated months are hatched and faded.
 */
export function ConsumptionChart({
  points,
  unit,
  hasPhotovoltaic,
}: {
  points: ConsumptionPoint[];
  unit: ConsumptionUnit;
  hasPhotovoltaic: boolean;
}) {
  // The id names SVG patterns used as url(#…): keep only characters safe in a fragment.
  const patternId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const present = presentSeries(points, unit, hasPhotovoltaic);
  const extras: Series[] = [
    ...(present.fromReadings
      ? [{ key: 'fromReadings' as const, label: READINGS_LABEL, color: READINGS_COLOR }]
      : []),
    ...(present.selfConsumption
      ? [{ key: 'selfConsumption' as const, label: 'Autoconsumo', color: SELF_COLOR }]
      : []),
    ...(present.feedIn
      ? [{ key: 'feedIn' as const, label: 'Immessa in rete', color: FEED_IN_COLOR }]
      : []),
  ];
  const allSeries = [...present.bands, ...extras];

  const legend: LegendItem[] = [
    ...present.bands.map((band) => ({ ...band, shape: 'bar' as const })),
    ...(present.isAnyEstimated
      ? [
          {
            key: 'estimated',
            label: 'stimato',
            color: 'var(--color-ink-muted)',
            shape: 'hatched' as const,
          },
        ]
      : []),
    ...extras.map((series) => ({
      key: series.key,
      label: series.label,
      color: series.color,
      shape:
        series.key === 'fromReadings'
          ? ('striped' as const)
          : series.key === 'feedIn'
            ? ('line' as const)
            : ('bar' as const),
    })),
  ];

  const columns = [
    { key: 'month', label: 'Mese' },
    ...allSeries.map((series) => ({ key: series.key, label: series.label })),
    ...(present.isAnyEstimated ? [{ key: 'estimated', label: 'Stato' }] : []),
  ];
  const rows = points.map((point) => ({
    key: point.month,
    cells: [
      point.label,
      ...allSeries.map((series) => quantityText(point[series.key] as number | null, unit)),
      ...(present.isAnyEstimated ? [point.isEstimated ? 'stimato' : '—'] : []),
    ],
  }));

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as ConsumptionPoint | undefined;
    if (!active || !point) return null;
    const tooltipRows: TooltipRow[] = allSeries
      .filter((series) => point[series.key] !== null)
      .map((series) => ({
        key: series.key,
        label: series.label,
        value: formatQuantity(point[series.key] as number, unit),
        color: series.color,
      }));
    if (tooltipRows.length === 0) return null;
    return (
      <ChartTooltipBox
        title={point.label}
        rows={tooltipRows}
        footer={point.isEstimated ? <p className="mt-1 font-semibold text-stamp">stimato</p> : null}
      />
    );
  };

  return (
    <ChartFrame
      title="Consumi per mese"
      subtitle={UNIT_LABELS[unit]}
      legend={legend}
      columns={columns}
      rows={rows}
      notes={
        points.some((point) => point.isReadingsConversionAssumed) ? (
          <p className="text-xs text-ink-soft">{CONVERSION_NOTE}</p>
        ) : null
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} stackOffset="sign" margin={CHART_MARGIN}>
          <defs>
            {present.bands.map((band) => (
              <HatchPattern key={band.key} id={`${patternId}-${band.key}`} color={band.color} />
            ))}
            <StripePattern id={`${patternId}-readings`} color={READINGS_COLOR} />
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
            width={72}
            tickFormatter={(value: number) => formatQuantity(value, unit)}
          />
          <Tooltip content={renderTooltip} cursor={BAR_CURSOR} isAnimationActive={false} />
          {present.bands.map((band) => (
            <Bar
              key={band.key}
              dataKey={band.key}
              name={band.label}
              stackId="consumption"
              fill={band.color}
              maxBarSize={MAX_BAR_SIZE}
              isAnimationActive={false}
              {...SEGMENT_GAP}
            >
              {points.map((point) => (
                <Cell
                  key={point.month}
                  fill={point.isEstimated ? `url(#${patternId}-${band.key})` : band.color}
                  fillOpacity={point.isEstimated ? ESTIMATED_OPACITY : 1}
                />
              ))}
            </Bar>
          ))}
          {present.fromReadings && (
            <Bar
              dataKey="fromReadings"
              name={READINGS_LABEL}
              stackId="consumption"
              fill={`url(#${patternId}-readings)`}
              stroke={READINGS_COLOR}
              strokeWidth={1}
              maxBarSize={MAX_BAR_SIZE}
              isAnimationActive={false}
            />
          )}
          {present.selfConsumption && (
            <Bar
              dataKey="selfConsumption"
              name="Autoconsumo"
              stackId="consumption"
              fill={SELF_COLOR}
              maxBarSize={MAX_BAR_SIZE}
              isAnimationActive={false}
              {...SEGMENT_GAP}
            />
          )}
          {present.feedIn && (
            <Line
              dataKey="feedIn"
              name="Immessa in rete"
              stroke={FEED_IN_COLOR}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2, stroke: 'var(--color-surface)', fill: FEED_IN_COLOR }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
