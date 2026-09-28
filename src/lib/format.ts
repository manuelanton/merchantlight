/** Display gold without floating-point garbage: 7.340000000000003 -> "7.34". */
export function g(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}

/** Split a total into integer-cent shares that sum EXACTLY to the total. */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => (i < rest ? base + 1 : base) / 100);
}
