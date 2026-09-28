import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/session";
import { getItems, getSales, getLedger, getOrders } from "@/lib/sheets";

export default async function AdminHome() {
  const s = await getAdminSession();
  if (!s.isAdmin) redirect("/admin/login");
  const [items, sales, ledger, orders] = await Promise.all([getItems(), getSales(), getLedger(), getOrders()]);

  const stockCost = items.reduce((a, i) => a + i.cost_value * i.stock, 0);
  const stockSale = items.reduce((a, i) => a + i.sale_price * i.stock, 0);
  const realizedProfit = sales.reduce((a, x) => a + x.total_profit, 0);
  const ledgerBal = ledger.reduce((a, x) => a + x.amount_gold, 0);
  const low = items.filter((i) => i.active && i.stock <= i.low_threshold);
  const newOrders = orders.filter((o) => o.status === "new");

  // per-member balances
  const members = new Map<string, number>();
  for (const e of ledger) members.set(e.member_char, (members.get(e.member_char) || 0) + e.amount_gold);
  const memberRows = [...members.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Quartermaster dashboard</h1>
      <div className="grid md:grid-cols-4 gap-4">
        <div className="card p-4"><div className="lbl">Stock value (cost)</div><div className="text-2xl text-[#e0bd4a]">{stockCost}g</div></div>
        <div className="card p-4"><div className="lbl">Stock value (sale)</div><div className="text-2xl text-[#e0bd4a]">{stockSale}g</div></div>
        <div className="card p-4"><div className="lbl">Potential profit</div><div className="text-2xl text-[#e0bd4a]">{stockSale - stockCost}g</div></div>
        <div className="card p-4"><div className="lbl">Realized profit (sales)</div><div className="text-2xl text-[#e0bd4a]">{realizedProfit}g</div></div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4">
          <h2 className="font-display text-lg">Ledger balance: {ledgerBal}g</h2>
          <table className="ledger mt-2"><thead><tr><th>Member</th><th>Net</th></tr></thead>
            <tbody>{memberRows.map(([m, v]) => <tr key={m}><td>{m}</td><td>{v}g</td></tr>)}</tbody>
          </table>
          {memberRows.length >= 2 && (
            <p className="text-xs text-[#8a7c64] mt-2">Even split of {ledgerBal}g across {memberRows.length} = {(ledgerBal / memberRows.length).toFixed(1)}g each.</p>
          )}
          <Link href="/admin/ledger" className="text-sm text-[#c9a227]">Open ledger →</Link>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-lg">Low stock ({low.length})</h2>
          <ul className="text-sm mt-2 space-y-1">{low.map((i) => <li key={i.id}>{i.name} — {i.stock} left</li>)}</ul>
          <Link href="/admin/inventory" className="text-sm text-[#c9a227]">Restock →</Link>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-lg">New orders ({newOrders.length})</h2>
          <ul className="text-sm mt-2 space-y-1">{newOrders.slice(0, 5).map((o) => <li key={o.id}>{o.customer_char} × {o.qty} ({o.pickup_location})</li>)}</ul>
          <Link href="/admin/orders" className="text-sm text-[#c9a227]">Review →</Link>
        </div>
      </div>
    </div>
  );
}
