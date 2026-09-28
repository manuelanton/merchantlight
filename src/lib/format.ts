/** Display gold without floating-point garbage: 7.340000000000003 -> "7.34". */
export function g(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}
