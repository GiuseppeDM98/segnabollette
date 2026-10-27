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
  LegendSwatch,
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
    label: 'Costo totale per unità, ultimi 12 mesi (IVA inclusa)',
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
 * What each line is, and why they cross: the commodity is one month's price, the total an average
 * of 12, so a fast rise in the commodity runs above the total until the average catches up.
 */
function ReadingGuide({ unit }: { unit: ConsumptionUnit }) {
  const unitLabel = UNIT_LABELS[unit];
  const [commodity, total] = PRICE_LINES;
  return (
    <dl className="flex max-w-prose flex-col gap-3 pt-1 text-sm">
      <div>
        <dt className="flex items-center gap-1.5 font-semibold">
          <LegendSwatch item={{ ...commodity, shape: 'line' }} />
          Materia prima
        </dt>
        <dd className="text-ink-soft">
          Il prezzo per {unitLabel} della sola materia prima in quel mese, senza IVA, quote fisse,
          rete, oneri e imposte. Dipende dall'offerta: è il numero da confrontare con le offerte e
          con i prezzi di mercato.
        </dd>
      </div>
      <div>
        <dt className="flex items-center gap-1.5 font-semibold">
          <LegendSwatch item={{ ...total, shape: 'line' }} />
          Costo totale per unità
        </dt>
        <dd className="text-ink-soft">
          Tutto quello che hai pagato nei 12 mesi fino a quel mese, IVA e quote fisse comprese,
          diviso per i {unitLabel} consumati negli stessi mesi: quanto ti è costato davvero ogni{' '}
          {unitLabel}. Così le quote fisse non lo fanno salire nei mesi in cui consumi poco. Parte
          quando ci sono 12 mesi di bollette.
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Perché le linee si incrociano</dt>
        <dd className="text-ink-soft">
          La materia prima è il prezzo di un mese, il costo totale la media di 12. Di solito il
          totale sta sopra, perché contiene anche tutto il resto. Quando la materia prima sale in
          fretta può superarlo per qualche mese, finché la media non la raggiunge; quando scende, il
          totale resta più alto ancora per un po'.
        </dd>
      </div>
    </dl>
  );
}

/**
 * The two unit prices over time, with market references dashed. A month without consumption has
 * no price and stays a gap (no line drawn across it); the dots keep a lone month visible. The
 * total per unit is over the 12 months ending at each month, drawn once 12 months are billed, and
 * «Come si legge» says so.
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
      guide={<ReadingGuide unit={unit} />}
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
