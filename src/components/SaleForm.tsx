"use client";
import { useMemo, useState } from "react";
import { recordSaleAction } from "@/lib/admin-actions";
import { effectivePrice } from "@/lib/cost";
import { g, num } from "@/lib/format";
import { SHOP } from "@/shop/config";
import LocationSelect from "./LocationSelect";
import ItemPicker from "./ItemPicker";
import NumInput from "./NumInput";

export interface CatalogOption {
  id: string;
  name: string;
  price: number;
  category: string;
  parent: string | null;
  parent_id?: string | null;
  inherit_parent?: boolean;
  hidden?: boolean;
}

export interface CategoryOption {
  slug: string;
  name: string;
}

interface Row {
  key: number;
  cat: string; // "" = all categories
  itemId: string;
  qty: string;
  price: string;
  discount: string;
}

const DEFAULT_LOCATIONS = [...SHOP.locations];

export default function SaleForm({ items, categories, locations = DEFAULT_LOCATIONS, showRoad = true, showDiscount = false }: { items: CatalogOption[]; categories: CategoryOption[]; locations?: string[]; showRoad?: boolean; showDiscount?: boolean }) {
  // Kinds are counters: inheriting variants sell at their parent's price.
  const priced = useMemo(
    () =>
      items.map((i) => ({
        ...i,
        price: effectivePrice(
          i.id,
          items.map((m) => ({ id: m.id, sale_price: m.price, parent_id: m.parent_id ?? m.parent, inherit_parent: m.inherit_parent ?? true }))
        ),
      })),
    [items]
  );
  const inCat = (cat: string) => (cat ? priced.filter((i) => i.category === cat) : priced);
  const firstOf = (cat: string) => inCat(cat)[0];
  const priceStr = (id: string) => g(priced.find((i) => i.id === id)?.price ?? 0);
  const parentName = (id: string | null) => (id ? priced.find((i) => i.id === id)?.name || null : null);
  const [rows, setRows] = useState<Row[]>(() => {
    const f = firstOf("");
    return [{ key: 0, cat: "", itemId: f?.id || "", qty: "1", price: g(f?.price ?? 0), discount: "0" }];
  });
  const [n, setN] = useState(1);

  const addRow = () => {
    const f = firstOf("");
    setRows((r) => [...r, { key: n, cat: "", itemId: f?.id || "", qty: "1", price: g(f?.price ?? 0), discount: "0" }]);
    setN((x) => x + 1);
  };
  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.cat !== undefined) {
          // Category changed: jump to its first item + base price.
          const f = firstOf(patch.cat);
          next.itemId = f?.id || "";
          next.price = String(f?.price ?? 0);
        } else if (patch.itemId !== undefined && patch.price === undefined) {
          next.price = priceStr(patch.itemId);
        }
        return next;
      })
    );
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const total = rows.reduce((a, r) => a + Math.max(0, num(r.qty) * num(r.price) - num(r.discount)), 0);

  return (
    <form action={recordSaleAction} className="card p-4 space-y-2">
      <div className="hidden md:grid grid-cols-12 gap-2 text-xs uppercase tracking-wider text-[#8a7c64]">
        <span className="col-span-3">Section</span>
        <span className={showDiscount ? "col-span-4" : "col-span-5"}>Item</span>
        <span className="col-span-1">Qty</span>
        <span className="col-span-2">Price (g)</span>
        {showDiscount && <span className="col-span-1">Disc (g)</span>}
        <span className="col-span-1" />
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-12 gap-2 items-center">
          <select
            className="input col-span-6 md:col-span-3" value={r.cat}
            onChange={(e) => setRow(r.key, { cat: e.target.value })}
            aria-label="Section"
          >
            <option value="">All sections</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <ItemPicker
            items={priced.map((i) => ({ ...i, parent: i.parent ? parentName(i.parent) : null }))}
            cat={r.cat} value={r.itemId}
            onChange={(id) => setRow(r.key, { itemId: id })}
            showPrice className={showDiscount ? "input col-span-6 md:col-span-4" : "input col-span-6 md:col-span-5"}
          />
          <NumInput name="qty" value={r.qty} onValueChange={(v) => setRow(r.key, { qty: v })} className="input col-span-5 md:col-span-1" ariaLabel="Quantity" />
          <NumInput name="unit_sale_price" value={r.price} onValueChange={(v) => setRow(r.key, { price: v })} className="input col-span-5 md:col-span-2" title="Base price auto-filled — edit for discounts" ariaLabel="Price each" />
          {showDiscount && (
            <NumInput name="discount" value={r.discount} onValueChange={(v) => setRow(r.key, { discount: v })} className="input col-span-4 md:col-span-1" title="Flat discount on this line — revenue is price minus discount" ariaLabel="Discount (g)" />
          )}
          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-3 w-10 shrink-0" title="Remove row">✕</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={addRow} className="btn-ghost !py-1 text-sm">+ Add item</button>
        <span className="text-sm text-[#8a7c64] ml-auto">Total: <b className="text-[#e0bd4a]">{g(total)}g</b></span>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className="lbl">Cost each, if known (g)</label><input name="unit_cost" type="number" step="any" min={0} defaultValue={0} className="input" /></div>
        <LocationSelect locations={locations} />
        <div><label className="lbl">Notes</label><input name="notes" className="input" placeholder="Haggled, bundle…" /></div>
      </div>
      {showRoad && (
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" name="from_road" value="1" className="accent-[#d97a1f]" />
        Sold on the road — goods never entered the chest, don&apos;t deduct stock
      </label>
      )}
      <div className="flex justify-end">
        <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Record sale</button>
      </div>
    </form>
  );
}
