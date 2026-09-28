"use client";
import { useState } from "react";
import { recordSaleAction } from "@/lib/admin-actions";
import MemberSelect from "./MemberSelect";

export interface CatalogOption {
  id: string;
  name: string;
  price: number;
  category: string;
}

export interface CategoryOption {
  slug: string;
  name: string;
}

interface Row {
  key: number;
  cat: string; // "" = all categories
  itemId: string;
  qty: number;
  price: number;
}

const LOCATIONS = ["Gallow's Rock", "Windhelm", "Darkwater Crossing", "Whiterun", "Winterhold"];

export default function SaleForm({ items, categories, sellerDefault, members }: { items: CatalogOption[]; categories: CategoryOption[]; sellerDefault: string; members: string[] }) {
  const inCat = (cat: string) => (cat ? items.filter((i) => i.category === cat) : items);
  const firstOf = (cat: string) => inCat(cat)[0];
  const [rows, setRows] = useState<Row[]>(() => {
    const f = firstOf("");
    return [{ key: 0, cat: "", itemId: f?.id || "", qty: 1, price: f?.price || 0 }];
  });
  const [n, setN] = useState(1);

  const addRow = () => {
    const f = firstOf("");
    setRows((r) => [...r, { key: n, cat: "", itemId: f?.id || "", qty: 1, price: f?.price || 0 }]);
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
          next.price = f?.price || 0;
        } else if (patch.itemId !== undefined && patch.price === undefined) {
          next.price = items.find((i) => i.id === patch.itemId)?.price || 0;
        }
        return next;
      })
    );
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const total = rows.reduce((a, r) => a + r.qty * r.price, 0);

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
          <select name="item_id" className="input col-span-6 md:col-span-5" value={r.itemId} onChange={(e) => setRow(r.key, { itemId: e.target.value })} required aria-label="Item">
            {inCat(r.cat).map((i) => <option key={i.id} value={i.id}>{i.name} — {i.price}g</option>)}
          </select>
          <input name="qty" type="number" min={1} value={r.qty} onChange={(e) => setRow(r.key, { qty: Number(e.target.value) })} className="input col-span-5 md:col-span-1" aria-label="Quantity" />
          <input name="unit_sale_price" type="number" min={0} value={r.price} onChange={(e) => setRow(r.key, { price: Number(e.target.value) })} className="input col-span-5 md:col-span-2" aria-label="Price each" title="Base price auto-filled — edit for discounts" />
          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-3 w-10 shrink-0" title="Remove row">✕</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={addRow} className="btn-ghost !py-1 text-sm">+ Add item</button>
        <span className="text-sm text-[#8a7c64] ml-auto">Total: <b className="text-[#e0bd4a]">{total}g</b></span>
      </div>
      <div className="grid md:grid-cols-4 gap-3">
        <MemberSelect members={members} name="seller" defaultValue={sellerDefault} label="Credit gold to" />
        <div><label className="lbl">Cost each, if known (g)</label><input name="unit_cost" type="number" min={0} defaultValue={0} className="input" /></div>
        <div><label className="lbl">Location</label>
          <select name="location" className="input">{LOCATIONS.map((l) => <option key={l}>{l}</option>)}</select>
        </div>
        <div><label className="lbl">Notes</label><input name="notes" className="input" placeholder="Haggled, bundle…" /></div>
      </div>
      <div className="flex justify-end">
        <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Record sale</button>
      </div>
    </form>
  );
}
