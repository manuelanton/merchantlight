import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from "@/lib/admin-actions";
import { getCatalogue } from "@/lib/catalog";
import { getBooks } from "@/lib/books";
import { getDb } from "@/db";
import { itemIngredients } from "@/db/schema";
import { effectiveCost } from "@/lib/cost";
import { effectiveMaxStock, unitValue } from "@/lib/defaults";
import { isFeatureOn } from "@/lib/features";
import { auth } from "@/auth";
import { canManage } from "@/lib/members";
import AddItemForm from "@/components/AddItemForm";
import Collapsible from "@/components/Collapsible";
import ItemsManager from "@/components/ItemsManager";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const [{ categories, items }, books, db] = await Promise.all([getCatalogue(), getBooks(), getDb()]);
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const stock: Record<string, number> = {};
  for (const [id, s] of books.stockByItem) stock[id] = s.qty;
  for (const [id, s] of books.stockByParent) stock[id] = s.qty;
  const ingredientRows = await db.select().from(itemIngredients);
  const costItems = items.map((m) => ({ id: m.id, cost_value: m.cost_value, sale_price: m.sale_price, parent_id: m.parent_id ?? null, inherit_parent: m.inherit_parent ?? true }));
  const costIngs = ingredientRows.map((r) => ({ itemId: r.itemId, materialItemId: r.materialItemId, qty: r.qty }));
  const effCost = (id: string) => effectiveCost(id, costItems, costIngs);
  const trackStock = await isFeatureOn("stock");
  const session = await auth();
  const manager = await canManage((session as unknown as { discordId?: string } | null)?.discordId);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Items & categories</h1>
      <p className="text-sm text-[#8a7c64]">
        This is the catalogue now — the sheet is retired. Edits appear on the site within a minute.
        Deleting an item is safe: sales and stock history keep its name.
      </p>

      {!manager && (
        <p className="text-sm text-[#e0bd4a]">Worker view — recording only. Catalogue changes need a Manager.</p>
      )}

      {manager && (
      <Collapsible title="Add item" defaultOpen>
        <AddItemForm
          categories={sorted.map((c) => ({ slug: c.slug, name: c.name }))}
          materials={items.filter((m) => m.category_slug === "materials").map((m) => ({ id: m.id, name: m.name, cost: m.cost_value }))}
        />
      </Collapsible>
      )}

      <ItemsManager
        items={items.map((i) => ({
          id: i.id, name: i.name, category_slug: i.category_slug,
          sale_price: i.sale_price, cost_value: i.cost_value,
          description: i.description, active: i.active,
          low_threshold: i.low_threshold ?? null,
          buy_price: i.buy_price, max_stock: i.max_stock ?? null,
          parent_id: i.parent_id ?? null,
          inherit_parent: i.inherit_parent ?? true,
        }))}
        categories={sorted.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))}
        stock={stock}
        showStock={trackStock}
        canManage={manager}
        ingredients={ingredientRows.map((r) => ({
          id: r.id, itemId: r.itemId, materialItemId: r.materialItemId,
          materialName: r.materialName, qty: r.qty,
        }))}
      />

      <Collapsible title="Buying guide (materials)">
        <p className="text-xs text-[#8a7c64]">What we pay suppliers, and when to stop buying. Edit buy price / cap in each row&apos;s Edit form. Blank buy falls back to cost; blank cap uses tiered default (&lt;1g → 500, &lt;2g → 250, else 10).</p>
        <table className="ledger mt-2">
          <thead><tr><th>Material</th><th>We pay</th>{trackStock && <th>On hand</th>}<th>Cap</th>{trackStock && <th>Status</th>}</tr></thead>
          <tbody>
            {items.filter((i) => i.category_slug === "materials").sort((a, b) => a.name.localeCompare(b.name)).map((m) => {
              const onHand = stock[m.id] ?? 0;
              const cost = effCost(m.id);
              const wePay = m.buy_price > 0 ? m.buy_price : cost;
              const val = unitValue({ buy_price: m.buy_price, cost_value: cost, sale_price: m.sale_price });
              const cap = effectiveMaxStock(m.max_stock, val);
              const auto = m.max_stock == null;
              const full = onHand >= cap;
              return (
                <tr key={m.id}>
                  <td><b>{m.name}</b></td>
                  <td className="text-[#e0bd4a]">{wePay > 0 ? `${wePay}g` : "—"}</td>
                  {trackStock && <td>{onHand}</td>}
                  <td>{cap}{auto && <span className="text-[#8a7c64]"> auto</span>}</td>
                  {trackStock && <td className={full ? "text-[#e08a8a]" : "text-[#7fd08a]"}>{full ? "Full — don't buy" : "Buying"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Collapsible>

      {manager && (
      <Collapsible title="Categories">
        <form action={createCategoryAction} className="flex flex-wrap gap-2 items-end">
          <div><label className="lbl">New section name *</label><input name="name" required className="input !w-auto" placeholder="Enchantments" /></div>
          <div><label className="lbl">Icon</label><input name="icon" defaultValue="📦" className="input !w-20" /></div>
          <button className="btn-gold !py-2" type="submit">Add section</button>
        </form>
        <ul className="space-y-2">
          {sorted.map((c) => {
            const n = items.filter((i) => i.category_slug === c.slug).length;
            return (
              <li key={c.slug} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{c.icon} <b>{c.name}</b> <span className="text-[#8a7c64]">({n} items)</span></span>
                <details className="inline-block">
                  <summary className="btn-ghost !py-1 !px-2 text-xs cursor-pointer list-none inline-block">Rename</summary>
                  <form action={renameCategoryAction} className="mt-2 p-3 card flex flex-wrap gap-2 items-end">
                    <input type="hidden" name="id" value={c.id} />
                    <div><label className="lbl">Name</label><input name="name" defaultValue={c.name} className="input !w-auto" /></div>
                    <div><label className="lbl">Icon</label><input name="icon" defaultValue={c.icon} className="input !w-20" /></div>
                    <button className="btn-gold !py-1 text-sm" type="submit">Save</button>
                  </form>
                </details>
                {n === 0 && (
                <form action={deleteCategoryAction} className="inline-block">
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete section">✕</button>
                </form>
                )}
              </li>
            );
          })}
        </ul>
      </Collapsible>
      )}
    </div>
  );
}
