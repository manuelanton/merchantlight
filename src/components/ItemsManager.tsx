"use client";
import { useMemo, useState } from "react";
import { deleteItemAction, updateItemAction } from "@/lib/admin-actions";

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

export default function ItemsManager({ items, categories }: { items: ManagedItem[]; categories: ManagedCategory[] }) {
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
            <thead><tr><th>Item</th><th>Price</th><th>Cost</th><th>Shown</th><th></th></tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.name}</b></td>
                  <td className="text-[#e0bd4a]">{i.sale_price}g</td>
                  <td>{i.cost_value}g</td>
                  <td>{i.active ? "yes" : "no"}</td>
                  <td className="whitespace-nowrap">
                    <details className="inline-block">
                      <summary className="btn-ghost !py-1 !px-2 text-xs cursor-pointer list-none inline-block">Edit</summary>
                      <form action={updateItemAction} className="mt-2 p-3 card space-y-2 min-w-[260px]">
                        <input type="hidden" name="id" value={i.id} />
                        <div><label className="lbl">Name</label><input name="name" defaultValue={i.name} className="input" /></div>
                        <div><label className="lbl">Category</label>
                          <select name="category_slug" defaultValue={i.category_slug} className="input">
                            {categories.map((cc) => <option key={cc.slug} value={cc.slug}>{cc.name}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="lbl">Price</label><input name="sale_price" type="number" defaultValue={i.sale_price} className="input" /></div>
                          <div><label className="lbl">Cost</label><input name="cost_value" type="number" defaultValue={i.cost_value} className="input" /></div>
                        </div>
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
