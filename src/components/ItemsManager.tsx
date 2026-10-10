"use client";
import { useEffect, useMemo, useState } from "react";
import { addIngredientAction, createVariantAction, deleteIngredientAction, deleteItemAction, updateItemAction } from "@/lib/admin-actions";
import { g } from "@/lib/format";
import { effectiveCost, effectivePrice, hasRecipe } from "@/lib/cost";
import { defaultMaxStock, unitValue } from "@/lib/defaults";
import IngredientForm from "./IngredientForm";

export interface ManagedItem {
  id: string;
  name: string;
  category_slug: string;
  sale_price: number;
  cost_value: number;
  description: string;
  active: boolean;
  low_threshold: number | null;
  buy_price: number;
  max_stock: number | null;
  parent_id: string | null;
  inherit_parent: boolean;
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

export default function ItemsManager({ items, categories, stock, ingredients, showStock = true }: { items: ManagedItem[]; categories: ManagedCategory[]; stock: Record<string, number>; ingredients: ManagedIngredient[]; showStock?: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [openRecipe, setOpenRecipe] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);

  const toggle = (slug: string) =>
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setEditId(null); setVariantId(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  const matName = (id: string, fallback: string) => items.find((i) => i.id === id)?.name || fallback;

  const costInputs = useMemo(() => ({
    items: items.map((m) => ({ id: m.id, cost_value: m.cost_value, sale_price: m.sale_price, parent_id: m.parent_id, inherit_parent: m.inherit_parent })),
    ingredients: ingredients.map((r) => ({ itemId: r.itemId, materialItemId: r.materialItemId, qty: r.qty })),
  }), [items, ingredients]);
  const eff = (id: string) => effectiveCost(id, costInputs.items, costInputs.ingredients);
  const effPrice = (id: string) => effectivePrice(id, costInputs.items);
  const fromRecipe = (id: string) => hasRecipe(id, costInputs.ingredients, costInputs.items);
  const matUnit = (id: string) => effectiveCost(id, costInputs.items, costInputs.ingredients);

  const editItem = editId ? items.find((i) => i.id === editId) ?? null : null;
  const variantParent = variantId ? items.find((i) => i.id === variantId) ?? null : null;
  const editCost = editItem ? eff(editItem.id) : 0;
  const editUnit = editItem ? unitValue({ buy_price: editItem.buy_price, cost_value: editCost, sale_price: editItem.sale_price }) : 0;
  const editAutoCap = defaultMaxStock(editUnit);
  const editKidCount = editItem ? items.filter((k) => k.parent_id === editItem.id).length : 0;
  const editCandidates = editItem ? items.filter((m) => !m.parent_id && m.id !== editItem.id && m.category_slug === editItem.category_slug) : [];

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
          <div className="overflow-x-auto">
          <table className="ledger w-full">
            <thead><tr><th>Item</th><th>Price</th><th>Cost</th><th>Profit</th>{showStock && <th>Stock</th>}<th>Shown</th><th></th></tr></thead>
            <tbody>
              {list.flatMap((i) => {
                if (i.parent_id) return []; // variants render under their parent
                const kids = list.filter((k) => k.parent_id === i.id);
                return [i, ...kids];
              }).map((i) => {
                const isVariant = !!i.parent_id;
                const cost = eff(i.id);
                const price = effPrice(i.id);
                const recipe = fromRecipe(i.id);
                const margin = Math.round((price - cost) * 100) / 100;
                const expanded = openRecipe === i.id;
                const kidCount = list.filter((k) => k.parent_id === i.id).length;
                const isParent = kidCount > 0;
                return (
                <>
                <tr key={i.id}>
                  <td><b>{isVariant ? `↳ ${i.name}` : i.name}</b>{!isVariant && isParent && <span className="text-xs text-[#8a7c64]"> ({kidCount} variants)</span>}{isVariant && i.inherit_parent && <span className="text-xs text-[#8a7c64]" title="Follows parent price/cost/recipe"> ⟡</span>}</td>
                  <td className="text-[#e0bd4a]">{price}g</td>
                  <td title={recipe ? "From recipe — updates with material costs" : "Manual cost"}>
                    {g(cost)}g{recipe && <span className="text-[#8a7c64]"> ≈</span>}
                  </td>
                  <td className={price - cost >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"} title="Approximate — sale price minus cost">
                    ≈{g(price - cost)}g
                  </td>
                  {showStock && <td>{stock[i.id] ?? 0}</td>}
                  <td>{i.active ? "yes" : "no"}</td>
                  <td>
                    <div className="flex gap-2 justify-end">
                      {!isVariant && i.category_slug !== "materials" && (
                        <button
                          type="button"
                          onClick={() => setOpenRecipe(expanded ? null : i.id)}
                          className="btn-ghost !py-1 !px-2 text-xs"
                          title="Recipe + cost math"
                        >
                          {expanded ? "Hide recipe" : "Recipe"}
                        </button>
                      )}
                      {!isVariant && (
                        <button
                          type="button"
                          onClick={() => setVariantId(i.id)}
                          className="btn-ghost !py-1 !px-2 text-xs"
                          title="Add a named variant (same price/cost, tracked separately)"
                        >
                          + Variant
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditId(i.id)}
                        className="btn-ghost !py-1 !px-2 text-xs"
                      >
                        Edit
                      </button>
                      <form action={deleteItemAction} className="inline-block">
                        <input type="hidden" name="id" value={i.id} />
                        <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete item">✕</button>
                      </form>
                    </div>
                  </td>
                </tr>
                {expanded && (
                <tr key={`${i.id}-recipe`}>
                  <td colSpan={showStock ? 7 : 6} className="!p-0">
                    <div className="m-3 p-4 card space-y-3">
                      <p className="text-xs">
                        Materials: <b className="text-[#e0bd4a]">{g(cost)}g</b> · Sells: <b className="text-[#e0bd4a]">{g(price)}g</b> ·{" "}
                        Margin: <b className={margin >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{g(margin)}g</b>
                      </p>
                        {(() => {
                          const lines = ingredients.filter((r) => r.itemId === i.id);
                          return (
                            <>
                              {lines.length > 0 ? (
                                <ul className="text-xs space-y-1">
                                  {lines.map((r) => {
                                    const c = matUnit(r.materialItemId);
                                    const assumed = c > 0 && !((items.find((m) => m.id === r.materialItemId)?.cost_value || 0) > 0);
                                    return (
                                    <li key={r.id} className="flex items-center gap-2">
                                      <span className="flex-1">{matName(r.materialItemId, r.materialName)} × {g(r.qty)} ({g(r.qty * c)}g{assumed ? " = price" : ""})</span>
                                    <form action={deleteIngredientAction} className="inline">
                                      <input type="hidden" name="id" value={r.id} />
                                      <button className="btn-ghost !py-0 !px-1.5 text-xs" type="submit" title="Remove ingredient">✕</button>
                                    </form>
                                  </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="text-xs text-[#8a7c64]">No recipe yet — add the first ingredient below.</p>
                            )}
                            <p className="text-xs text-[#8a7c64]">Unknown costs count as sale price (zero assumed profit) — overwrite on the material when known.</p>
                            <IngredientForm
                              itemId={i.id}
                              materials={items.filter((m) => m.category_slug === "materials").map((m) => ({ id: m.id, name: m.name, cost: m.cost_value }))}
                              onSaved={() => setOpenRecipe(null)}
                            />
                          </>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
                )}
                </>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      ))}
      {!byCat.length && <p className="text-sm text-[#8a7c64]">No items match — clear the search or re-enable sections.</p>}

      {variantParent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button aria-label="Close" onClick={() => setVariantId(null)} className="absolute inset-0 bg-black/70" />
          <form
            action={async (fd: FormData) => { await createVariantAction(fd); setVariantId(null); }}
            className="relative card p-5 space-y-3 w-full max-w-sm max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg flex-1">+ Variant of {variantParent.name}</h3>
              <button type="button" onClick={() => setVariantId(null)} className="btn-ghost !py-1 !px-2 text-xs" title="Close">✕</button>
            </div>
            <input type="hidden" name="parent_id" value={variantParent.id} />
            <div><label className="lbl">Variant name</label><input name="name" required autoFocus className="input" placeholder="e.g. Common Clothes (blue)" /></div>
            <p className="text-xs text-[#8a7c64]">Copies price/cost, inherits live after that.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setVariantId(null)} className="btn-ghost !py-1 text-sm">Cancel</button>
              <button className="btn-gold !py-1 text-sm" type="submit">Add variant</button>
            </div>
          </form>
        </div>
      )}

      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button aria-label="Close" onClick={() => setEditId(null)} className="absolute inset-0 bg-black/70" />
          <form
            key={editItem.id}
            action={async (fd: FormData) => { await updateItemAction(fd); setEditId(null); }}
            className="relative card p-5 space-y-3 w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg flex-1">Edit — {editItem.name}</h3>
              <button type="button" onClick={() => setEditId(null)} className="btn-ghost !py-1 !px-2 text-xs" title="Close (Esc)">✕</button>
            </div>
            <input type="hidden" name="id" value={editItem.id} />
            <div><label className="lbl">Name</label><input name="name" defaultValue={editItem.name} className="input" /></div>
            {editItem.parent_id && (editItem.inherit_parent ?? true) && (
              <p className="text-xs text-[#8a7c64]">
                Counter of {items.find((m) => m.id === editItem.parent_id)?.name || "parent"} — sells at{" "}
                <b className="text-[#e0bd4a]">{g(effPrice(editItem.id))}g</b>, costs {g(editCost)}g. Price/cost below are ignored while inherit is on.
              </p>
            )}
            <div><label className="lbl">Category</label>
              <select name="category_slug" defaultValue={editItem.category_slug} className="input">
                {categories.map((cc) => <option key={cc.slug} value={cc.slug}>{cc.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="lbl">Price</label><input name="sale_price" type="number" step="any" defaultValue={editItem.sale_price} className="input" /></div>
              <div><label className="lbl">Cost</label><input name="cost_value" type="number" step="any" defaultValue={editItem.cost_value} className="input" /></div>
            </div>
            <div><label className="lbl">Description</label><input name="description" defaultValue={editItem.description} className="input" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="lbl">Low at</label><input name="low_threshold" type="number" min={0} step="any" defaultValue={editItem.low_threshold ?? ""} placeholder="auto (2)" className="input" title="Warn when stock hits this — blank uses the default (2)" /></div>
              <div><label className="lbl">Buy price</label><input name="buy_price" type="number" min={0} step="any" defaultValue={editItem.buy_price || ""} placeholder={editCost > 0 ? `${g(editCost)}g (cost)` : "0"} className="input" title="What we pay suppliers per unit — blank falls back to cost" /></div>
              <div><label className="lbl">Max stock</label><input name="max_stock" type="number" min={0} step="1" defaultValue={editItem.max_stock ?? ""} placeholder={`auto (${editAutoCap})`} className="input" title={`Don't buy past this — blank uses tiered default (${editAutoCap})`} /></div>
            </div>
            {editKidCount > 0 ? (
              <p className="text-xs text-[#8a7c64]">Has {editKidCount} variant(s) — delete or re-home them first to make this a variant.</p>
            ) : (
              <>
                <div><label className="lbl">Parent (variant of)</label>
                  <select name="parent_id" defaultValue={editItem.parent_id ?? ""} className="input">
                    <option value="">None (top-level)</option>
                    {editCandidates.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-[#b8a888] cursor-pointer">
                  <input type="checkbox" name="inherit_parent" defaultChecked={editItem.inherit_parent ?? true} className="accent-[#d97a1f]" />
                  Inherit price/cost/recipe from parent
                </label>
              </>
            )}
            <div><label className="lbl">Visible</label>
              <select name="active" defaultValue={String(editItem.active)} className="input"><option value="true">Yes</option><option value="false">Hidden</option></select>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={() => setEditId(null)} className="btn-ghost !py-1 text-sm">Cancel</button>
              <button className="btn-gold !py-1 text-sm" type="submit">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
