import { addDays, weekStart } from "@/lib/store-data";

export const isDay = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export const RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

export interface DateRange {
  key: string;
  from: string | null;
  to: string | null;
  week: string;
}

export interface RangeParams {
  range?: string;
  from?: string;
  to?: string;
  week?: string;
}

/** The chosen range from the URL, the week by default as in the Tavern. Weeks run Monday to Sunday, UTC. */
export function resolveRange(params: RangeParams): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  const week = isDay(params.week) ?? weekStart();
  if (isDay(params.from) || isDay(params.to)) return { key: "custom", from: isDay(params.from), to: isDay(params.to), week };
  if (params.range === "today") return { key: "today", from: today, to: today, week };
  if (params.range === "30d") return { key: "30d", from: addDays(today, -29), to: today, week };
  if (params.range === "all") return { key: "all", from: null, to: null, week };
  return { key: "week", from: week, to: addDays(week, 6), week };
}

/** What a link or filter form has to carry along so the range survives. */
export function rangeParams(range: DateRange): Record<string, string> {
  if (range.key === "custom") return { ...(range.from && { from: range.from }), ...(range.to && { to: range.to }) };
  if (range.key === "week") return range.week === weekStart() ? {} : { week: range.week };
  return { range: range.key };
}

export function pageHref(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, v);
  return `${path}?${query}`;
}
