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

/** "paid for the next 6 days 4 hours" / "overdue by 3 hours" from minutes remaining. */
export function rentCountdown(minutesLeft: number | null): string {
  if (minutesLeft === null || !Number.isFinite(minutesLeft)) return "not tracked yet";
  const overdue = minutesLeft < 0;
  const total = Math.abs(minutesLeft);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (!days && mins) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);
  const span = parts.length ? parts.join(" ") : "less than a minute";
  return overdue ? `overdue by ${span}` : `paid for the next ${span}`;
}

/** "2026-11-20 12:00" (UTC) -> "20 Nov 2026, 12:00 UTC". */
export function utcLabel(value: string): string {
  const d = new Date(`${value.replace(" ", "T")}:00Z`);
  if (Number.isNaN(d.getTime())) return `${value} UTC`;
  const label = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(d);
  return `${label} UTC`;
}
