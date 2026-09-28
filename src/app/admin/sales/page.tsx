import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getItems, getSales } from "@/lib/sheets";
import { recordSaleAction } from "@/lib/actions";
import { PICKUP_LOCATIONS } from "@/lib/types";

export default async function SalesPage() {
  const s = await getAdminSession();
  if (!s.isAdmin) redirect("/admin/login");
  const [items, sales] = await Promise.all([getItems(), getSales()]);
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name || id;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Sales & profit</h1>
      <form action={recordSaleAction} className="card p-5 grid md:grid-cols-3 gap-3">
        <div><label className="lbl">Item</label>
          <select name="item_id" className="input">{items.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name} (cost {i.cost_value}g, stock {i.stock})</option>)}</select>
        </div>
        <div><label className="lbl">Qty</label><input name="qty" type="number" min={1} defaultValue={1} className="input" /></div>
        <div><label className="lbl">Actual sale price each (g)</label><input name="unit_sale_price" type="number" min={0} defaultValue={0} className="input" /></div>
        <div><label className="lbl">Location</label>
          <select name="location" className="input">{PICKUP_LOCATIONS.map((l) => <option key={l}>{l}</option>)}</select>
        </div>
        <div className="md:col-span-2"><label className="lbl">Notes</label><input name="notes" className="input" placeholder="Haggled, bundle…" /></div>
        <div className="md:col-span-3"><button className="btn-gold" type="submit">Record sale as {s.charName} (auto-decrements stock)</button></div>
      </form>

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[800px]">
          <thead><tr><th>When</th><th>Item</th><th>Qty</th><th>Price</th><th>Profit</th><th>Where</th><th>By</th></tr></thead>
          <tbody>
            {sales.map((x) => (
              <tr key={x.id}>
                <td className="text-xs">{new Date(x.timestamp).toLocaleString()}</td>
                <td>{nameOf(x.item_id)}</td>
                <td>{x.qty}</td>
                <td>{x.unit_sale_price}g</td>
                <td className="text-[#7fd08a]">+{x.total_profit}g</td>
                <td>{x.location}</td>
                <td>{x.sold_by_char}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
