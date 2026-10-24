'use client';

import { useState } from 'react';
import { buttonClass } from '@/components/ui/styles';
import { percentChange, type YearOverYearPoint } from '@/lib/charts/series';
import type { ConsumptionUnit } from '@/lib/domain/types';
import { formatEuro, formatEuroValue, formatQuantity, UNIT_LABELS } from '@/lib/format';
import { ChartFrame } from './chart-frame';
import {
  AXIS_LINE,
  AXIS_TICK,
  BAR_CURSOR,
  CHART_MARGIN,
  ChartTooltipBox,
  GRID_STROKE,
  type LegendItem,
  MAX_BAR_SIZE,
} from './chart-parts';
import { KpiTile } from './kpi-tile';
import {
  Bar,
  BarChart,
  CartesianGrid,
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

type Metric = 'consumption' | 'cost';

export interface YearOverYearTotals {
  consumption: { last12: number | null; previous12: number | null; isComparable: boolean } | null;
  cost: { last12Cents: number; previous12Cents: number; isComparable: boolean };
}

/** The change is shown only when the two periods are comparable and both have a value. */
function tileChange(last12: number | null, previous12: number | null, isComparable: boolean) {
  if (!isComparable || last12 === null || previous12 === null) return null;
  return percentChange(last12, previous12);
}

/**
 * The 12 months ending at the last billed month beside the same months a year earlier, under the
 * «Ultimi 12 mesi» tiles. Metered supplies switch between consumption and spending; flat fees
 * have spending only.
 */
export function YearOverYearChart({
  consumption,
  cost,
  unit,
  totals,
}: {
  consumption: YearOverYearPoint[] | null;
  cost: YearOverYearPoint[];
  unit: ConsumptionUnit | null;
  totals: YearOverYearTotals;
}) {
  const [metric, setMetric] = useState<Metric>(consumption ? 'consumption' : 'cost');
  const consumptionUnit = metric === 'consumption' && consumption !== null ? unit : null;
  const isConsumption = consumptionUnit !== null;
  const points = isConsumption && consumption ? consumption : cost;
  const valueText = (value: number | null) => {
    if (value === null) return '—';
    return consumptionUnit ? formatQuantity(value, consumptionUnit) : formatEuroValue(value);
  };

  const rows = points.map((point) => ({
    key: point.month,
    cells: [point.label, valueText(point.current), valueText(point.previous)],
  }));
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
      </div>
      <ChartFrame
        title="Anno su anno"
        subtitle={consumptionUnit ? UNIT_LABELS[consumptionUnit] : '€, IVA inclusa'}
        legend={LEGEND}
        columns={[
          { key: 'month', label: 'Mese' },
          { key: CURRENT.key, label: "Quest'anno" },
          { key: PREVIOUS.key, label: 'Anno prima' },
        ]}
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
              width={isConsumption ? 72 : 80}
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
      </ChartFrame>
    </div>
  );
}
