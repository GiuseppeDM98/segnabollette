import { describe, expect, it } from 'vitest';
import { averagePeople, buildHouseholdMonths, peopleOn } from './household';

// Out of order on purpose: the functions sort the changes themselves.
const CHANGES = [
  { validFrom: '2023-09-18', people: 3 },
  { validFrom: '2022-03-10', people: 2 },
  { validFrom: '2025-02-07', people: 4 },
];

describe('peopleOn', () => {
  it('takes the last change on or before the day, and knows nothing before the first', () => {
    expect(peopleOn(CHANGES, '2022-03-09')).toBeNull();
    expect(peopleOn(CHANGES, '2022-03-10')).toBe(2);
    expect(peopleOn(CHANGES, '2023-09-17')).toBe(2);
    expect(peopleOn(CHANGES, '2023-09-18')).toBe(3);
    expect(peopleOn(CHANGES, '2026-10-27')).toBe(4);
  });
});

describe('averagePeople', () => {
  it('weighs each day the same across a change', () => {
    // 2025-02-01..2025-02-28: 6 days with 3 people, 22 with 4.
    expect(averagePeople(CHANGES, '2025-02-01', '2025-02-28')).toBeCloseTo((6 * 3 + 22 * 4) / 28);
  });

  it('is the number itself over a period without changes', () => {
    expect(averagePeople(CHANGES, '2025-10-01', '2026-09-30')).toBe(4);
  });

  it('is unknown when the period starts before the first change', () => {
    expect(averagePeople(CHANGES, '2022-01-01', '2022-12-31')).toBeNull();
    expect(averagePeople([], '2025-01-01', '2025-12-31')).toBeNull();
  });
});

describe('buildHouseholdMonths', () => {
  it('gives each month its people on the last day and the changes that fall in it', () => {
    const [february, march, september] = buildHouseholdMonths(CHANGES, [
      '2022-02',
      '2022-03',
      '2023-09',
    ]);

    expect(february).toEqual({ month: '2022-02', people: null, changes: [] });
    expect(march).toEqual({
      month: '2022-03',
      people: 2,
      changes: [{ validFrom: '2022-03-10', people: 2 }],
    });
    expect(september?.people).toBe(3);
    expect(september?.changes).toEqual([{ validFrom: '2023-09-18', people: 3 }]);
  });
});
