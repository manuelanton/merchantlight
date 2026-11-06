import Link from "next/link";
import { RANGE_PRESETS, pageHref, type DateRange } from "@/lib/date-range";
import { addDays, weekStart } from "@/lib/store-data";

/** Today / Week / 30 days / All time / Custom, with arrows through the weeks. `keep` is every other filter in the URL. */
export default function RangeBar({ path, range, keep = {} }: { path: string; range: DateRange; keep?: Record<string, string | undefined> }) {
  const custom = range.key === "custom";
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {RANGE_PRESETS.map((p) => (
        <Link key={p.key} href={pageHref(path, { ...keep, range: p.key === "week" ? undefined : p.key })} className={`${p.key === range.key ? "btn-gold" : "btn-ghost"} !py-1 text-sm`}>{p.label}</Link>
      ))}
      <form className="flex flex-wrap items-center gap-2">
        {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <input type="date" name="from" defaultValue={custom ? range.from ?? "" : ""} className="input !w-auto !py-1 text-sm" aria-label="From" />
        <input type="date" name="to" defaultValue={custom ? range.to ?? "" : ""} className="input !w-auto !py-1 text-sm" aria-label="To" />
        <button className={`${custom ? "btn-gold" : "btn-ghost"} !py-1 text-sm`} type="submit">Custom</button>
      </form>
      {range.key === "week" && (
        <span className="flex items-center gap-2 text-sm">
          <Link className="btn-ghost !py-1 !px-3" href={pageHref(path, { ...keep, week: addDays(range.week, -7) })} aria-label="Previous week">←</Link>
          <span className="tabular-nums">{range.week} – {addDays(range.week, 6)}</span>
          <Link className="btn-ghost !py-1 !px-3" href={pageHref(path, { ...keep, week: addDays(range.week, 7) })} aria-label="Next week">→</Link>
          {range.week !== weekStart() && <Link className="btn-ghost !py-1 text-sm" href={pageHref(path, keep)}>This week</Link>}
        </span>
      )}
    </div>
  );
}
