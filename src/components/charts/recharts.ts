'use client';

/**
 * The one file that imports recharts: the charts take every primitive from here, so a version
 * upgrade or a swap touches one import list. Recharts' ReferenceLine is renamed because the app
 * has its own ReferenceLine type (a market reference series, src/lib/charts/series.ts).
 */
export {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine as RechartsReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
