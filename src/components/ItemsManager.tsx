"use client";
import { useMemo, useState } from "react";
import { addIngredientAction, deleteIngredientAction, deleteItemAction, updateItemAction } from "@/lib/admin-actions";
import { g } from "@/lib/format";

export interface ManagedItem {
  id: string;
  name: string;
  category_slug: string;
  sale_price: number;
  cost_value: number;
  description: string;
  active: boolean;
}

export interface ManagedCategory {
  slug: string;
  name: string;
  icon: string;
}

export interface ManagedIngredient {
  id: string;
  itemId: string;
  materialItemId: string;
  materialName: string;
  qty: number;
}

export default function ItemsManager({ items, categories, stock, ingredients }: { items: ManagedItem[]; categories: ManagedCategory[]; stock: Record<string, number>; ingredients: ManagedIngredient[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (slug: string) =>
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!selected.length || selected.includes(i.category_slug)) &&
        (!q || i.name.toLowerCase().includes(q))
    );
  }, [items, query, selected]);

  const byCat = useMemo(() => {
    const order = new Map(categories.map((c, i) => [c.slug, i]));
    const groups = new Map<string, ManagedItem[]>();
    for (const i of visible) {
      const g = groups.get(i.category_slug) || [];
      g.push(i);
      groups.set(i.category_slug, g);
    }
    return [...groups.entries()].sort(
      ([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999)
    );
  }, [visible, categories]);

  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name || slug;
  const catIcon = (slug: string) => categories.find((c) => c.slug === slug)?.icon || "📦";
  const matCost = (id: string) => items.find((i) => i.id === id)?.cost_value || 0;
  const matName = (id: string, fallback: string) => items.find((i) => i.id === id)?.name || fallback;
  const recipeCost = (itemId: string) =>
    Math.round(ingredients.filter((r) => r.itemId === itemId).reduce((a, r) => a + r.qty * matCost(r.materialItemId), 0) * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          className="input" placeholder="Search items…"
        />
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = selected.includes(c.slug);
            return (
              <button
                key={c.slug} type="button" onClick={() => toggle(c.slug)}
                className={
                  "text-sm px-3 py-1 rounded-full border transition " +
                  (on ? "bg-[#d97a1f] text-[#17100a] border-[#d97a1f] font-bold" : "border-[#2b4149] text-[#8a7c64]")
                }
                title={on ? "Click to remove filter" : "Click to show only this section"}
              >
                {c.icon} {c.name}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[#8a7c64]">
          {selected.length ? `Filtered to ${selected.length} section${selected.length > 1 ? "s" : ""} — ` : ""}
          {visible.length} of {items.length} items shown.
        </p>
      </div>

      {byCat.map(([slug, list]) => (
        <div key={slug} className="card overflow-hidden">
          <div className="p-3 border-b border-[#1c2b31] font-display text-lg">
            {catIcon(slug)} {catName(slug)} <span className="text-sm text-[#8a7c64]">({list.length})</span>
          </div>
          <table className="ledger">
            <thead><tr><th>Item</th><th>Price</th><th>Cost</th><th>Stock</th><th>Shown</th><th></th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.name}</b></td>
                  <td className="text-[#e0bd4a]">{i.sale_price}g</td>
                  <td>{i.cost_value}g</td>
                  <td>{stock[i.id] ?? 0}</td>
                  <td>{i.active ? "yes" : "no"}</td>
                  <td className="whitespace-nowrap">
                    <details className="inline-block">
                      <summary className="btn-ghost !py-1 !px-2 text-xs cursor-pointer list-none inline-block" title="Recipe + cost math">Recipe</summary>
                      <div className="mt-2 p-3 card space-y-2 min-w-[280px]">
                        {(() => {
                          const lines = ingredients.filter((r) => r.itemId === i.id);
                          const cost = recipeCost(i.id);
                          const margin = Math.round((i.sale_price - cost) * 100) / 100;
                          const unknownCost = lines.some((r) => matCost(r.materialItemId) <= 0);
                          return (
                            <>
                              {lines.length > 0 ? (
                                <ul className="text-xs space-y-1">
                                  {lines.map((r) => {
                                    const c = matCost(r.materialItemId);
                                    return (
                                    <li key={r.id} className="flex items-center gap-2">
                                      <span className="flex-1">{matName(r.materialItemId, r.materialName)} × {g(r.qty)} ({c > 0 ? `${g(r.qty * c)}g` : "cost unknown"})</span>
                                      <form action={deleteIngredientAction} className="inline">
                                        <input type="hidden" name="id" value={r.id} />
                                        <button className="btn-ghost !py-0 !px-1.5 text-xs" type="submit" title="Remove ingredient">✕</button>
                                      </form>
                                    </li>
                                    );
                                  })}
                                </ul>
                              ) : (
                                <p className="text-xs text-[#8a7c64]">No recipe yet.</p>
                              )}
                              <p className="text-xs">
                                Materials: <b className="text-[#e0bd4a]">{g(cost)}g</b> · Sells: <b className="text-[#e0bd4a]">{g(i.sale_price)}g</b> ·{" "}
                                Margin: <b className={margin >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{g(margin)}g</b>
                                {unknownCost && <span className="text-[#8a7c64]"> (some costs unknown — fill them on the material)</span>}
                              </p>
                              <form action={addIngredientAction} className="space-y-2">
                                <input type="hidden" name="item_id" value={i.id} />
                                <div><label className="lbl">Material</label>
                                  <select name="material_item_id" className="input">
                                    {items.filter((m) => m.category_slug === "materials").map((m) => <option key={m.id} value={m.id}>{m.name}{m.cost_value ? ` (${g(m.cost_value)}g)` : ""}</option>)}
                                  </select>
                                </div>
                                <div className="flex gap-2 items-end">
                                  <div className="w-24"><label className="lbl">Qty</label><input name="qty" type="number" min={0.01} step="any" defaultValue={1} className="input" /></div>
                                  <button className="btn-ghost !py-1 text-xs" type="submit">Add</button>
                                </div>
                              </form>
                            </>
                          );
                        })()}
                      </div>
                    </details>{" "}
                    <details className="inline-block">
                      <summary className="btn-ghost !py-1 !px-2 text-xs cursor-pointer list-none inline-block">Edit</summary>
                      <form action={updateItemAction} className="mt-2 p-3 card space-y-2 min-w-[300px] max-w-[340px]">
                        <input type="hidden" name="id" value={i.id} />
                        <div><label className="lbl">Name</label><input name="name" defaultValue={i.name} className="input" /></div>
                        <div><label className="lbl">Category</label>
                          <select name="category_slug" defaultValue={i.category_slug} className="input">
                            {categories.map((cc) => <option key={cc.slug} value={cc.slug}>{cc.name}</option>)}
                          </select>
                        </div>
                        <div><label className="lbl">Price</label><input name="sale_price" type="number" defaultValue={i.sale_price} className="input" /></div>
                        <div><label className="lbl">Cost</label><input name="cost_value" type="number" defaultValue={i.cost_value} className="input" /></div>
                        <div><label className="lbl">Description</label><input name="description" defaultValue={i.description} className="input" /></div>
                        <div><label className="lbl">Visible</label>
                          <select name="active" defaultValue={String(i.active)} className="input"><option value="true">Yes</option><option value="false">Hidden</option></select>
                        </div>
                        <button className="btn-gold !py-1 w-full text-sm" type="submit">Save</button>
                      </form>
                    </details>{" "}
                    <form action={deleteItemAction} className="inline-block">
                      <input type="hidden" name="id" value={i.id} />
                      <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete item">✕</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!byCat.length && <p className="text-sm text-[#8a7c64]">No items match — clear the search or re-enable sections.</p>}
    </div>
  );
}
