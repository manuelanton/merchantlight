import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getItems, getOrders } from "@/lib/sheets";
import { setOrderStatusAction } from "@/lib/actions";

export default async function OrdersPage() {
  const s = await getAdminSession();
  if (!s.isAdmin) redirect("/admin/login");
  const [orders, items] = await Promise.all([getOrders(), getItems()]);
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name || id;
  const priceOf = (id: string) => items.find((i) => i.id === id)?.sale_price || 0;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Customer orders</h1>
      <div className="grid gap-3">
        {orders.map((o) => (
          <div key={o.id} className="card p-4 flex flex-wrap gap-3 items-center">
            <div className="min-w-[220px]">
              <b>{o.customer_char}</b> <span className="text-xs text-[#8a7c64]">{o.discord_handle}</span><br />
              <span>{nameOf(o.item_id)} × {o.qty} — ~{priceOf(o.item_id) * o.qty}g</span><br />
              <span className="text-xs text-[#8a7c64]">{o.pickup_location} • {new Date(o.timestamp).toLocaleString()} • {o.notes}</span>
            </div>
            <span className="badge">{o.status}</span>
            <form action={setOrderStatusAction} className="ml-auto flex gap-2 items-center">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="item_id" value={o.item_id} />
              <input type="hidden" name="qty" value={o.qty} />
              <input type="hidden" name="pickup_location" value={o.pickup_location} />
              <input type="hidden" name="unit_sale_price" value={priceOf(o.item_id)} />
              <select name="status" defaultValue={o.status} className="input !w-auto">
                <option value="new">new</option><option value="accepted">accepted</option>
                <option value="fulfilled">fulfilled</option><option value="cancelled">cancelled</option>
              </select>
              <label className="text-xs flex gap-1 items-center"><input type="checkbox" name="auto_sale" value="1" defaultChecked /> log sale</label>
              <button className="btn-ghost !py-1" type="submit">Update</button>
            </form>
          </div>
        ))}
        {!orders.length && <p className="text-[#8a7c64]">No orders yet. Share /order with white shirts.</p>}
      </div>
      <p className="text-xs text-[#8a7c64]">Logged in as {s.charName}. Fulfilling with “log sale” checked auto-decrements stock and records profit.</p>
    </div>
  );
}
