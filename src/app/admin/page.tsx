import Link from "next/link";
import { getBooks } from "@/lib/books";

export default async function AdminHome() {
  const b = await getBooks();
  const ledgerBal = b.ledgerRows.reduce((a, e) => a + e.amountGold, 0);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Quartermaster dashboard</h1>
      <div className="grid md:grid-cols-4 gap-4">
        <div className="card p-4"><div className="lbl">Revenue (sales)</div><div className="text-2xl text-[#e0bd4a]">{b.revenue}g</div></div>
        <div className="card p-4"><div className="lbl">Profit (sales)</div><div className="text-2xl text-[#e0bd4a]">{b.profit}g</div></div>
        <div className="card p-4"><div className="lbl">Rent paid</div><div className="text-2xl text-[#e0bd4a]">{b.rentPaid}g</div></div>
        <div className="card p-4"><div className="lbl">Ledger balance</div><div className="text-2xl text-[#e0bd4a]">{ledgerBal}g</div></div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4">
          <h2 className="font-display text-lg">Per-member balances</h2>
          <table className="ledger mt-2"><thead><tr><th>Member</th><th>Net</th></tr></thead>
            <tbody>{b.balances.map(([m, v]) => <tr key={m}><td>{m}</td><td>{v}g</td></tr>)}</tbody>
          </table>
          {b.balances.length >= 2 && (
            <p className="text-xs text-[#8a7c64] mt-2">Even split of {ledgerBal}g across {b.balances.length} = {(ledgerBal / b.balances.length).toFixed(1)}g each.</p>
          )}
          <Link href="/admin/ledger" className="text-sm text-[#c9a227]">Open ledger →</Link>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-lg">Recent sales</h2>
          <ul className="text-sm mt-2 space-y-1">
            {b.salesRows.slice(0, 5).map((s) => (
              <li key={s.id}>{s.itemName} × {s.qty} — {s.unitSalePrice * s.qty}g ({s.location})</li>
            ))}
            {!b.salesRows.length && <li className="text-[#8a7c64]">No sales recorded yet.</li>}
          </ul>
          <Link href="/admin/sales" className="text-sm text-[#c9a227]">Record a sale →</Link>
        </div>
        <div className="card p-4">
          <h2 className="font-display text-lg">Stock on hand</h2>
          <ul className="text-sm mt-2 space-y-1">
            {[...b.stockByItem.values()].filter((s) => s.qty !== 0).slice(0, 8).map((s) => (
              <li key={s.name}>{s.name} — {s.qty}</li>
            ))}
            {![...b.stockByItem.values()].some((s) => s.qty !== 0) && (
              <li className="text-[#8a7c64]">Nothing tracked yet — log restocks under Stock.</li>
            )}
          </ul>
          <Link href="/admin/stock" className="text-sm text-[#c9a227]">Manage stock →</Link>
        </div>
      </div>
    </div>
  );
}
