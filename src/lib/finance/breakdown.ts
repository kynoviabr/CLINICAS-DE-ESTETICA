/** Agrupa valores por rótulo, do maior para o menor (zeros ficam de fora). */
export function groupTotals<T>(items: T[], label: (i: T) => string, value: (i: T) => number): Array<[string, number]> {
  const map = new Map<string, number>();
  items.forEach((i) => map.set(label(i), (map.get(label(i)) ?? 0) + value(i)));
  return [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}
