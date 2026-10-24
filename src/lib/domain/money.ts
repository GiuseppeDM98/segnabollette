/**
 * Integer money. Amounts are signed euro cents; unit prices are integer micro-euros per unit
 * (0,099000 €/kWh = 99000), because bills print six decimals. 1 cent = 10,000 micro-euros.
 */

/**
 * Split an integer amount over non-negative weights so that the parts add up exactly to it
 * (largest-remainder method; ties go to the earlier weight).
 */
export function allocateCentsByWeights(amountCents: number, weights: readonly number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (weights.length === 0) return [];
  if (totalWeight <= 0) {
    throw new RangeError('allocateCentsByWeights: weights must sum to more than 0');
  }
  const sign = amountCents < 0 ? -1 : 1;
  const absolute = Math.abs(amountCents);
  const exact = weights.map((w) => (absolute * w) / totalWeight);
  const parts = exact.map((value) => Math.floor(value));
  let remainder = absolute - parts.reduce((sum, p) => sum + p, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byFraction) {
    if (remainder === 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    remainder -= 1;
  }
  return parts.map((part) => part * sign);
}

/** Price per unit in micro-euros, or null when there is no positive quantity to divide by. */
export function unitPriceMicros(cents: number, quantity: number | null): number | null {
  if (quantity === null || !(quantity > 0)) return null;
  return Math.round((cents * 10_000) / quantity);
}

/** A euro amount typed by a person ('12,34') → cents, or null. */
export function centsFromEuro(euro: number | null): number | null {
  return euro === null ? null : Math.round(euro * 100);
}

/** A unit price typed by a person ('0,099') → micro-euros, or null. */
export function microsFromEuro(euro: number | null): number | null {
  return euro === null ? null : Math.round(euro * 1_000_000);
}
