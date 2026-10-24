/** What a delete removes, as the confirmation dialog says it. */
export interface DeletionCounts {
  supplies: number;
  bills: number;
  readings: number;
}

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

export function deletionSummaryText({ supplies, bills, readings }: DeletionCounts): string {
  return `Eliminerai ${count(supplies, 'fornitura', 'forniture')}, ${count(
    bills,
    'bolletta',
    'bollette',
  )} e ${count(readings, 'lettura', 'letture')}.`;
}
