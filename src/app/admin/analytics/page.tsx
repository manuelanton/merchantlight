import { BalanceChart, SalesChart } from "@/components/AnalyticsCharts";
import RangeBar from "@/components/RangeBar";
import { Empty, PageHeader, Section, Stat } from "@/components/store-ui";
import { resolveRange, type RangeParams } from "@/lib/date-range";
import { g } from "@/lib/format";
import { requireManager } from "@/lib/store-access";
import { addDays, analytics, treasuryBalance } from "@/lib/store-data";

export const dynamic = "force-dynamic";

function Rank({ rows, empty }: { rows: { name: string; sub?: string; value: number }[]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5 p-4">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-baseline justify-between gap-2 text-sm mb-1">
            <span className="truncate">{r.name}{r.sub && <span className="muted text-xs ml-1.5">{r.sub}</span>}</span>
            <span className="tabular-nums shrink-0">{g(r.value)}g</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#1c2b31] overflow-hidden">
            <div className="h-full rounded-full bg-[#b08c12]" style={{ width: `${Math.max(2, (Math.max(r.value, 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<RangeParams> }) {
  const access = await requireManager();
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const range = resolveRange(params);
  const { from, to } = range;

  const [data, cash] = await Promise.all([analytics(access.profileId, from, to), treasuryBalance(access.profileId)]);

  const revenue = data.days.reduce((sum, d) => sum + d.revenue, 0);
  const profit = data.days.reduce((sum, d) => sum + d.profit, 0);
  const receipts = data.days.reduce((sum, d) => sum + d.receipts, 0);
  const sold = data.items.reduce((sum, i) => sum + i.quantity, 0);

  // Days without a sale stay on the chart as zero, so the gaps show.
  const byDay = new Map(data.days.map((d) => [d.day, d]));
  const last = [to ?? today, today].sort()[0];
  const days = [];
  for (let d = from ?? data.days[0]?.day; d && d <= last; d = addDays(d, 1)) days.push(byDay.get(d) ?? { day: d, revenue: 0, profit: 0, receipts: 0 });

  return (
    <>
      <PageHeader title="Analytics" subtitle="How the store is doing." />

      <RangeBar path="/admin/analytics" range={range} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-3">
        <Stat label="Revenue" value={`${g(revenue)}g`} />
        <Stat label="Profit" value={`${g(profit)}g`} tone={profit < 0 ? "bad" : undefined} />
        <Stat label="Margin" value={`${revenue ? Math.round((profit / revenue) * 100) : 0}%`} />
        <Stat label="Receipts" value={String(receipts)} />
        <Stat label="Items sold" value={g(sold)} />
        <Stat label="Avg receipt" value={`${g(receipts ? revenue / receipts : 0)}g`} />
      </div>
      <div className="mb-8">
        <Stat label="Net profit" value={`${g(data.net)}g`} tone={data.net < 0 ? "bad" : undefined} />
        <p className="muted text-xs mt-2">
          Net profit is sales and rent minus every expense, purchases included: what Payments shares out. Profit above is only what the receipts earned over their cost.
        </p>
      </div>

      <Section title="Sales over time" aside="Revenue and profit per day">
        <div className="panel p-4">
          {receipts ? <SalesChart days={days} /> : <Empty>No receipts in this range.</Empty>}
          {receipts > 0 && (
            <details className="mt-2">
              <summary className="muted text-xs cursor-pointer">Show as table</summary>
              <table className="ledger mt-2">
                <thead><tr><th>Day</th><th className="text-right">Receipts</th><th className="text-right">Revenue</th><th className="text-right">Profit</th></tr></thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr key={d.day}>
                      <td className="tabular-nums">{d.day}</td>
                      <td className="text-right tabular-nums">{d.receipts}</td>
                      <td className="text-right tabular-nums">{g(d.revenue)}g</td>
                      <td className="text-right tabular-nums">{g(d.profit)}g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-x-6">
        <Section title="Top sellers" aside="By revenue, before receipt discounts">
          <div className="panel"><Rank rows={data.items.slice(0, 10).map((i) => ({ name: i.name, sub: `${g(i.quantity)}×`, value: i.revenue }))} empty="No sales in this range." /></div>
        </Section>
        <Section title="Revenue by category">
          <div className="panel"><Rank rows={data.categories.map((c) => ({ name: c.name, value: c.revenue }))} empty="No sales in this range." /></div>
        </Section>
      </div>

      <Section title="Sales & profit per person" aside="By seller on the receipt">
        <div className="panel overflow-x-auto">
          <table className="ledger min-w-[30rem]">
            <thead><tr><th>Seller</th><th className="text-right">Receipts</th><th className="text-right">Revenue</th><th className="text-right">Profit</th><th className="text-right">Tips</th></tr></thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="text-right tabular-nums">{p.receipts}</td>
                  <td className="text-right tabular-nums">{g(p.revenue)}g</td>
                  <td className="text-right tabular-nums">{g(p.profit)}g</td>
                  <td className="text-right tabular-nums">{g(p.tips)}g</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.people.length && <Empty>No sales in this range.</Empty>}
        </div>
      </Section>

      <div className="grid md:grid-cols-2 gap-x-6">
        <Section title="Where the capital sits" aside={`${g(cash + data.goods_value + data.materials_value)}g in total, right now`}>
          <div className="panel">
            <Rank rows={[{ name: "Treasury", value: cash }, { name: "Goods in stock", value: data.goods_value }, { name: "Raw materials", value: data.materials_value }]} empty="" />
          </div>
        </Section>
        <Section title="Treasury balance" aside="All time">
          <div className="panel p-4">
            {data.balances.length ? <BalanceChart balances={data.balances} /> : <Empty>No treasury entries yet.</Empty>}
          </div>
        </Section>
      </div>
    </>
  );
}
