/**
 * Readings → per-day consumption. A reading on day d is the counter at the end of day d, so the
 * difference between readings on d1 and d2 belongs to the days after d1 up to d2, spread evenly.
 */
import { addDays, daysBetween } from '@/lib/domain/dates';
import type { IsoDate, ReadingRegister, ReadingSource } from '@/lib/domain/types';
import type { EngineReading } from './types';

const SOURCE_PRIORITY: Record<ReadingSource, number> = {
  bill_actual: 0,
  self: 1,
  bill_estimated: 2,
};

/** One reading per (day, register): actual beats self beats estimated; then the latest entered. */
export function pickReadings(readings: readonly EngineReading[]): EngineReading[] {
  const chosen = new Map<string, EngineReading>();
  for (const reading of readings) {
    const key = `${reading.readOn}|${reading.register}`;
    const current = chosen.get(key);
    if (
      !current ||
      SOURCE_PRIORITY[reading.source] < SOURCE_PRIORITY[current.source] ||
      (SOURCE_PRIORITY[reading.source] === SOURCE_PRIORITY[current.source] &&
        reading.createdAt > current.createdAt)
    ) {
      chosen.set(key, reading);
    }
  }
  return [...chosen.values()].sort((a, b) =>
    a.readOn < b.readOn ? -1 : a.readOn > b.readOn ? 1 : 0,
  );
}

/**
 * Per-day consumption of one register. A drop in the counter (a replaced meter) breaks the
 * series: that interval is skipped instead of producing negative consumption.
 */
export function dailyFromReadings(
  readings: readonly EngineReading[],
  register: ReadingRegister,
): Map<IsoDate, number> {
  const series = pickReadings(readings).filter((r) => r.register === register);
  const daily = new Map<IsoDate, number>();
  for (let i = 1; i < series.length; i++) {
    const previous = series[i - 1];
    const next = series[i];
    if (!previous || !next) continue;
    const days = daysBetween(previous.readOn, next.readOn);
    const delta = next.value - previous.value;
    if (days <= 0 || delta < 0) continue;
    for (let d = 1; d <= days; d++) daily.set(addDays(previous.readOn, d), delta / days);
  }
  return daily;
}
