/**
 * The people living in a house over time, from its list of changes: each change holds from its
 * day until the day before the next one. Before the first change the household is unknown (null),
 * never assumed.
 */
import { addDays, daysInclusive, monthEnd, monthKeyOf } from '@/lib/domain/dates';
import type { IsoDate, MonthKey } from '@/lib/domain/types';

export interface HouseholdChange {
  validFrom: IsoDate;
  people: number;
}

export interface HouseholdMonth {
  month: MonthKey;
  /** The people on the month's last day; null before the first change. */
  people: number | null;
  /** The changes that fall in the month, oldest first: the marks on the cost charts. */
  changes: HouseholdChange[];
}

function sorted(changes: readonly HouseholdChange[]): HouseholdChange[] {
  return [...changes].sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1));
}

/** The people on a day: the last change on or before it. */
export function peopleOn(changes: readonly HouseholdChange[], day: IsoDate): number | null {
  let people: number | null = null;
  for (const change of sorted(changes)) {
    if (change.validFrom > day) break;
    people = change.people;
  }
  return people;
}

/**
 * The average of the people over the days from `from` to `to`, each day weighing the same: 2
 * people for 9 months and 3 for 3 months is 2,25. Null unless every day is covered, so a
 * per-person figure is never made from a household that is only partly known.
 */
export function averagePeople(
  changes: readonly HouseholdChange[],
  from: IsoDate,
  to: IsoDate,
): number | null {
  const ordered = sorted(changes);
  if (ordered.length === 0 || (ordered[0]?.validFrom ?? to) > from) return null;
  let personDays = 0;
  ordered.forEach((change, index) => {
    const next = ordered[index + 1];
    const start = change.validFrom > from ? change.validFrom : from;
    const lastDay = next ? addDays(next.validFrom, -1) : to;
    const end = lastDay < to ? lastDay : to;
    if (end >= start) personDays += change.people * daysInclusive(start, end);
  });
  return personDays / daysInclusive(from, to);
}

export function buildHouseholdMonths(
  changes: readonly HouseholdChange[],
  months: readonly MonthKey[],
): HouseholdMonth[] {
  const ordered = sorted(changes);
  return months.map((month) => ({
    month,
    people: peopleOn(ordered, monthEnd(month)),
    changes: ordered.filter((change) => monthKeyOf(change.validFrom) === month),
  }));
}
