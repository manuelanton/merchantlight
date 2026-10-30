import Link from "next/link";
import { getReport, RANGE_PRESETS } from "@/lib/report";
import { g } from "@/lib/format";
import { requireQuartermasterPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

/** v2 pilot: who sold what, and is it working. Frozen snapshots — history never shifts. */
export default async function V2ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireQuartermasterPage();
  const { range = "30" } = await searchParams;
  const preset = RANGE_PRESETS.find((p) => p.key === range) || RANGE_PRESETS[2];
  const r = await getReport(preset.days);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Sales report <span className="badge">v2 pilot</span></h1>
      <div className="flex flex-wrap gap-2 items-center">
        {RANGE_PRESETS.map((p) => (
          <Link
            key={p.key}
            href={`/admin/v2/report?range=${p.key}`}
            className={
              "text-sm px-3 py-1 rounded-full border transition " +
              (p.key === preset.key
                ? "bg-[#d97a1f] text-[#17100a] border-[#d97a1f] font-bold"
                : "border-[#2b4149] text-[#8a7c64]")
            }
          >
            {p.label}
          </Link>
        ))}
        <Link href="/admin/sales" className="text-sm text-[#c9a227] ml-auto">All sales →</Link>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="card p-4"><div className="lbl">Revenue</div><div className="text-2xl text-[#e0bd4a]">{g(r.totals.revenue)}g</div></div>
        <div className="card p-4"><div className="lbl">Profit</div><div className="text-2xl text-[#e0bd4a]">{g(r.totals.profit)}g</div></div>
        <div className="card p-4"><div className="lbl">Sale lines</div><div className="text-2xl text-[#e0bd4a]">{r.totals.lines}</div></div>
        <div className="card p-4"><div className="lbl">Units sold</div><div className="text-2xl text-[#e0bd4a]">{r.totals.qty}</div></div>
      </div>

      <div className="card p-4">
        <h2 className="font-display text-lg">Per seller</h2>
        <div className="overflow-x-auto">
          <table className="ledger mt-2 min-w-[560px]">
            <thead><tr><th>Seller</th><th>Lines</th><th>Qty</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>
              {r.sellers.map((s) => (
                <tr key={s.name}>
                  <td><b>{s.name}</b></td>
                  <td>{s.lines}</td>
                  <td>{s.qty}</td>
                  <td className="text-[#e0bd4a]">{g(s.revenue)}g</td>
                  <td className="text-[#7fd08a]">+{g(s.profit)}g</td>
                </tr>
              ))}
              {!r.sellers.length && <tr><td colSpan={5} className="text-[#8a7c64]">No sales in range.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-display text-lg">Revenue by section</h2>
          <table className="ledger mt-2"><thead><tr><th>Section</th><th>Qty</th><th>Revenue</th></tr></thead>
            <tbody>
              {r.categories.map((c) => (
                <tr key={c.category}><td>{c.category}</td><td>{c.qty}</td><td className="text-[#e0bd4a]">{g(c.revenue)}g</td></tr>
              ))}
              {!r.categories.length && <tr><td colSpan={3} className="text-[#8a7c64]">No sales in range.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-lg">Top items (by qty)</h2>
          <table className="ledger mt-2"><thead><tr><th>Item</th><th>Qty</th><th>Revenue</th></tr></thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.name}><td>{i.name}</td><td>{i.qty}</td><td className="text-[#e0bd4a]">{g(i.revenue)}g</td></tr>
              ))}
              {!r.items.length && <tr><td colSpan={3} className="text-[#8a7c64]">No sales in range.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
