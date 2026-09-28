import {
  createCategoryAction,
  createItemAction,
  deleteCategoryAction,
  renameCategoryAction,
} from "@/lib/admin-actions";
import { getCatalogue } from "@/lib/catalog";
import ItemsManager from "@/components/ItemsManager";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const { categories, items } = await getCatalogue();
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">Items & categories</h1>
      <p className="text-sm text-[#8a7c64]">
        This is the catalogue now — the sheet is retired. Edits appear on the site within a minute.
        Deleting an item is safe: sales and stock history keep its name.
      </p>

      <form action={createItemAction} className="card p-5 space-y-3">
        <h2 className="font-display text-lg">Add item</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className="lbl">Name *</label><input name="name" required className="input" placeholder="Fine Leather Boots" /></div>
          <div><label className="lbl">Category</label>
            <select name="category_slug" className="input">{sorted.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
          </div>
          <div><label className="lbl">Visible</label>
            <select name="active" className="input"><option value="true">Yes</option><option value="false">Hidden</option></select>
          </div>
          <div><label className="lbl">Price (g)</label><input name="sale_price" type="number" min={0} defaultValue={0} className="input" /></div>
          <div><label className="lbl">Cost (g, private)</label><input name="cost_value" type="number" min={0} defaultValue={0} className="input" /></div>
          <div><label className="lbl">Description</label><input name="description" className="input" placeholder="Materials, bulk rates…" /></div>
        </div>
        <button className="btn-gold" type="submit">Add item</button>
      </form>

      <ItemsManager
        items={items.map((i) => ({
          id: i.id, name: i.name, category_slug: i.category_slug,
          sale_price: i.sale_price, cost_value: i.cost_value,
          description: i.description, active: i.active,
        }))}
        categories={sorted.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon }))}
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
                <form action={deleteCategoryAction} className="inline-block">
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title={n ? `Holds ${n} items — empty it first` : "Delete section"}>✕</button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
