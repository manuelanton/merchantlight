import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getCategories, getItems } from "@/lib/sheets";
import { saveItemAction, adjustStockAction } from "@/lib/actions";

export default async function InventoryPage() {
  const s = await getAdminSession();
  if (!s.isAdmin) redirect("/admin/login");
  const [cats, items] = await Promise.all([getCategories(), getItems()]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Inventory & stock</h1>

      <form action={saveItemAction} className="card p-5 space-y-3">
        <h2 className="font-display text-lg">Add / edit item (same ID = edit, tracks who added)</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className="lbl">ID (slug)</label><input name="id" className="input" placeholder="it-new-bag" /></div>
          <div><label className="lbl">Name *</label><input name="name" required className="input" placeholder="Fine Leather Boots" /></div>
          <div><label className="lbl">Category</label>
            <select name="category_slug" className="input">{cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
          </div>
          <div><label className="lbl">Sale price (g)</label><input name="sale_price" type="number" min={0} defaultValue={0} className="input" /></div>
          <div><label className="lbl">Cost value (g)</label><input name="cost_value" type="number" min={0} defaultValue={0} className="input" /></div>
          <div><label className="lbl">Stock</label><input name="stock" type="number" min={0} defaultValue={0} className="input" /></div>
          <div><label className="lbl">Low threshold</label><input name="low_threshold" type="number" min={0} defaultValue={2} className="input" /></div>
          <div><label className="lbl">Image URL</label><input name="image_url" className="input" placeholder="https://…" /></div>
          <div><label className="lbl">Active</label>
            <select name="active" className="input"><option value="true">Yes</option><option value="false">Archived</option></select>
          </div>
        </div>
        <div><label className="lbl">Description</label><input name="description" className="input" placeholder="Materials, colors…" /></div>
        <button className="btn-gold" type="submit">Save item as {s.charName}</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[800px]">
          <thead><tr><th>Item</th><th>Cat</th><th>Sale</th><th>Cost</th><th>Stock</th><th>Maker</th><th>Adjust</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td><b>{i.name}</b><br /><span className="text-xs text-[#8a7c64]">{i.id}</span></td>
                <td>{i.category_slug}</td>
                <td className="text-[#e0bd4a]">{i.sale_price}g</td>
                <td>{i.cost_value}g</td>
                <td>{i.stock}</td>
                <td className="text-xs">{i.created_by_char || "—"}</td>
                <td>
                  <div className="flex gap-1">
                    <form action={adjustStockAction}><input type="hidden" name="item_id" value={i.id} /><input type="hidden" name="delta" value="1" /><button className="btn-ghost !px-2 !py-1">+1</button></form>
                    <form action={adjustStockAction}><input type="hidden" name="item_id" value={i.id} /><input type="hidden" name="delta" value="-1" /><button className="btn-ghost !px-2 !py-1">−1</button></form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
