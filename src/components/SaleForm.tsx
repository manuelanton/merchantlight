"use client";
import { useMemo, useState } from "react";
import { recordSaleAction } from "@/lib/admin-actions";
import { effectivePrice } from "@/lib/cost";
import { SHOP } from "@/shop/config";
import LocationSelect from "./LocationSelect";
import ItemPicker from "./ItemPicker";

export interface CatalogOption {
  id: string;
  name: string;
  price: number;
  category: string;
  parent: string | null;
  parent_id?: string | null;
  inherit_parent?: boolean;
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
}

const DEFAULT_LOCATIONS = [...SHOP.locations];

export default function SaleForm({ items, categories, locations = DEFAULT_LOCATIONS }: { items: CatalogOption[]; categories: CategoryOption[]; locations?: string[] }) {
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
  const priceStr = (id: string) => String(priced.find((i) => i.id === id)?.price ?? 0);
  const parentName = (id: string | null) => (id ? priced.find((i) => i.id === id)?.name || null : null);
  const [rows, setRows] = useState<Row[]>(() => {
    const f = firstOf("");
    return [{ key: 0, cat: "", itemId: f?.id || "", qty: "1", price: String(f?.price ?? 0) }];
  });
  const [n, setN] = useState(1);

  const addRow = () => {
    const f = firstOf("");
    setRows((r) => [...r, { key: n, cat: "", itemId: f?.id || "", qty: "1", price: String(f?.price ?? 0) }]);
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

  const total = rows.reduce((a, r) => a + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);

  return (
    <form action={recordSaleAction} className="card p-4 space-y-2">
      <div className="hidden md:grid grid-cols-12 gap-2 text-xs uppercase tracking-wider text-[#8a7c64]">
        <span className="col-span-3">Section</span>
        <span className="col-span-5">Item</span>
        <span className="col-span-1">Qty</span>
        <span className="col-span-2">Price (g)</span>
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
            showPrice className="input col-span-6 md:col-span-5"
          />
          <input name="qty" type="number" step="any" min={1} value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} className="input col-span-5 md:col-span-1" aria-label="Quantity" />
          <input name="unit_sale_price" type="number" step="any" min={0} value={r.price} onChange={(e) => setRow(r.key, { price: e.target.value })} className="input col-span-5 md:col-span-2" aria-label="Price each" title="Base price auto-filled — edit for discounts" />
          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-3 w-10 shrink-0" title="Remove row">✕</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={addRow} className="btn-ghost !py-1 text-sm">+ Add item</button>
        <span className="text-sm text-[#8a7c64] ml-auto">Total: <b className="text-[#e0bd4a]">{total}g</b></span>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className="lbl">Cost each, if known (g)</label><input name="unit_cost" type="number" step="any" min={0} defaultValue={0} className="input" /></div>
        <LocationSelect locations={locations} />
        <div><label className="lbl">Notes</label><input name="notes" className="input" placeholder="Haggled, bundle…" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" name="from_road" value="1" className="accent-[#d97a1f]" />
        Sold on the road — goods never entered the chest, don&apos;t deduct stock
      </label>
      <div className="flex justify-end">
        <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Record sale</button>
      </div>
    </form>
  );
}
