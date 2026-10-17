/** Display gold without floating-point garbage: 7.340000000000003 -> "7.34". */
export function g(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}

/** Parse a gold/qty form value: accepts "15", "15.5", and "15,5" (comma decimal). */
export function num(v: FormDataEntryValue | null | undefined, fallback = 0): number {
  const s = String(v ?? "").trim().replace(",", ".");
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** Split a total into integer-cent shares that sum EXACTLY to the total. */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rest = cents - base * n;
  return Array.from({ length: n }, (_, i) => (i < rest ? base + 1 : base) / 100);
}
