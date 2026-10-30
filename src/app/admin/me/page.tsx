import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { sales, employeePurchases } from "@/db/schema";
import { getMemberForDiscord } from "@/lib/members";
import { getWeekRange } from "@/lib/reports";
import { g } from "@/lib/format";
import { eq, and, gte, lte } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EmployeeMePage() {
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !discordId) redirect("/admin");
  const member = await getMemberForDiscord(discordId);
  if (member?.role !== "employee" && !isQuartermaster(discordId)) redirect("/admin");
  const db = await getDb();
  const range = getWeekRange();
  const [salesRows, purchases] = await Promise.all([
    db.select().from(sales).where(and(eq(sales.soldByDiscordId, discordId), gte(sales.timestamp, range.start), lte(sales.timestamp, range.end))),
    db.select().from(employeePurchases).where(and(eq(employeePurchases.employeeDiscordId, discordId), gte(employeePurchases.createdAt, range.start), lte(employeePurchases.createdAt, range.end))),
  ]);
  const confirmed = salesRows.filter((s) => s.status === "confirmed");
  const salesProfit = confirmed.reduce((a, s) => a + Number(s.totalProfit || 0), 0);
  const commission = salesProfit * 0.5;
  const purchasesTotal = purchases.reduce((a, p) => a + Number(p.costTotal || 0), 0);
  const totalPay = commission - purchasesTotal;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">My Portal</h1>
      <p className="text-sm text-[#8a7c64]">{new Date(range.start).toLocaleDateString()} - {new Date(range.end).toLocaleDateString()} (Sat-Fri) • Commission 50% of confirmed sale profit − purchases</p>
      <div className="grid md:grid-cols-5 gap-4">
        <div className="card p-4"><div className="lbl">My Sales (confirmed)</div><div className="text-2xl text-[#e0bd4a]">{confirmed.length}</div></div>
        <div className="card p-4"><div className="lbl">My Sales Profit</div><div className="text-2xl text-[#e0bd4a]">{g(salesProfit)}g</div></div>
        <div className="card p-4"><div className="lbl">Commission (50%)</div><div className="text-2xl text-[#e0bd4a]">{g(commission)}g</div></div>
        <div className="card p-4"><div className="lbl">Purchases (deducted)</div><div className="text-2xl text-[#e0bd4a]">{g(purchasesTotal)}g</div></div>
        <div className="card p-4"><div className="lbl">Est. Pay</div><div className="text-2xl text-[#e0bd4a]">{g(totalPay)}g</div></div>
      </div>
      <div className="card p-4 overflow-x-auto">
        <h2 className="font-display text-lg mb-2">My Sales This Week</h2>
        <table className="ledger">
          <thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Price</th><th>Profit</th><th>Status</th></tr></thead>
          <tbody>
            {salesRows.map((s) => <tr key={s.id}><td className="text-xs">{new Date(s.timestamp).toLocaleString()}</td><td>{s.itemName}</td><td>{s.qty}</td><td>{g(s.unitSalePrice)}g</td><td>{g(s.totalProfit)}g</td><td>{s.status}</td></tr>)}
            {!salesRows.length && <tr><td colSpan={6} className="text-[#8a7c64]">No sales this week.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}