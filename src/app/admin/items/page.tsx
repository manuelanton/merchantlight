import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from "@/lib/admin-actions";
import { getCatalogue } from "@/lib/catalog";
import { getBooks } from "@/lib/books";
import { getDb } from "@/db";
import { itemIngredients } from "@/db/schema";
import AddItemForm from "@/components/AddItemForm";
import ItemsManager from "@/components/ItemsManager";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const [{ categories, items }, books, db] = await Promise.all([getCatalogue(), getBooks(), getDb()]);
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const stock: Record<string, number> = {};
  for (const [id, s] of books.stockByItem) stock[id] = s.qty;
  const ingredientRows = await db.select().from(itemIngredients);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Items & categories</h1>
      <p className="text-sm text-[#8a7c64]">
        This is the catalogue now — the sheet is retired. Edits appear on the site within a minute.
        Deleting an item is safe: sales and stock history keep its name.
      </p>

      <AddItemForm
        categories={sorted.map((c) => ({ slug: c.slug, name: c.name }))}
        materials={items.filter((m) => m.category_slug === "materials").map((m) => ({ id: m.id, name: m.name, cost: m.cost_value }))}
      />

      <ItemsManager
        items={items.map((i) => ({
          id: i.id, name: i.name, category_slug: i.category_slug,
          sale_price: i.sale_price, cost_value: i.cost_value,
          description: i.description, active: i.active,
        }))}
        categories={sorted.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))}
        stock={stock}
        ingredients={ingredientRows.map((r) => ({
          id: r.id, itemId: r.itemId, materialItemId: r.materialItemId,
          materialName: r.materialName, qty: r.qty,
        }))}
      />

      <div className="card p-5 space-y-4">
        <h2 className="font-display text-lg">Categories</h2>
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
      </div>
    </div>
  );
}
