/**
 * The pieces every chart shares: axis and grid styling, the hatch patterns, the HTML legend and
 * the tooltip box. Colours are always token variables (DESIGN.md § Charts): text in charts wears
 * the ink tokens, only marks wear a series colour. Recharts' own animations are off everywhere:
 * the stamp is the app's only motion.
 */
import type { CSSProperties, ReactNode } from 'react';

export const AXIS_TICK = {
  fill: 'var(--color-ink-soft)',
  fontSize: 11,
  fontFamily: 'var(--font-print)',
};
/**
 * Room on the right for the last month label, which the axis centres on its bar or, in the line
 * chart, on the plot's right edge: «ott 2026» at 11 px needs about 27 px past that edge (20 cut
 * its last digit at 390 px, 2026-10-25).
 */
export const CHART_MARGIN = { top: 8, right: 32, bottom: 0, left: 0 };
export const AXIS_LINE = { stroke: 'var(--color-rule-strong)' };
export const GRID_STROKE = 'var(--color-rule)';
export const ZERO_LINE_STROKE = 'var(--color-ink-muted)';
export const BAR_CURSOR = { fill: 'var(--color-surface-sunk)' };
export const LINE_CURSOR = { stroke: 'var(--color-rule-strong)', strokeWidth: 1 };
/** Bars stay thin: the band's leftover is air. */
export const MAX_BAR_SIZE = 24;
/** The surface-coloured edge that leaves a 2 px gap between touching segments. */
export const SEGMENT_GAP = { stroke: 'var(--color-surface)', strokeWidth: 1 };

/**
 * A 45° hatch: the series colour crossed by surface-coloured stripes. Estimated months and the
 * fed-in credit use it, so they read apart from the solid marks even without colour.
 */
export function HatchPattern({ id, color }: { id: string; color: string }) {
  return (
    <pattern
      id={id}
      width={6}
      height={6}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width={6} height={6} fill={color} />
      <line x1={0} y1={0} x2={0} y2={6} stroke="var(--color-surface)" strokeWidth={2} />
    </pattern>
  );
}

/** Stripes of the series colour on the surface: consumption measured but not billed yet. */
export function StripePattern({ id, color }: { id: string; color: string }) {
  return (
    <pattern
      id={id}
      width={6}
      height={6}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width={6} height={6} fill="var(--color-surface)" />
      <line x1={0} y1={0} x2={0} y2={6} stroke={color} strokeWidth={3} />
    </pattern>
  );
}

export type LegendShape = 'bar' | 'line' | 'dashed' | 'hatched' | 'striped';

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  shape: LegendShape;
}

const HATCH = (color: string) =>
  `repeating-linear-gradient(45deg, ${color} 0 3px, var(--color-surface) 3px 5px)`;

function swatchStyle(item: LegendItem): CSSProperties {
  switch (item.shape) {
    case 'line':
      return { width: 14, height: 2, background: item.color };
    case 'dashed':
      return { width: 14, height: 0, borderTop: `2px dashed ${item.color}` };
    case 'hatched':
      return { width: 12, height: 12, background: HATCH(item.color), opacity: 0.55 };
    case 'striped':
      return {
        width: 12,
        height: 12,
        background: `repeating-linear-gradient(45deg, var(--color-surface) 0 2px, ${item.color} 2px 4px)`,
        border: `1px solid ${item.color}`,
      };
    default:
      return { width: 12, height: 12, background: item.color };
  }
}

/** The legend under a chart: a swatch shaped like the mark beside a label in ink. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft" aria-label="Legenda">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block shrink-0" style={swatchStyle(item)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  color?: string;
}

/** The hover box: the month, then one row per series with the value leading. */
export function ChartTooltipBox({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-40 rounded-sm border border-rule-strong bg-surface px-3 py-2 text-xs text-ink">
      <p className="figures mb-1 font-bold">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-2.5 shrink-0"
              style={{ background: row.color ?? 'transparent' }}
            />
            <span className="figures font-bold">{row.value}</span>
            <span className="text-ink-soft">{row.label}</span>
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}
