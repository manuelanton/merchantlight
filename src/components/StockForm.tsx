"use client";
import { useState } from "react";
import { adjustStockAction } from "@/lib/admin-actions";
import MemberSelect from "./MemberSelect";
import type { CatalogOption, CategoryOption } from "./SaleForm";

interface Row {
  key: number;
  cat: string;
  itemId: string;
  delta: number;
}

export default function StockForm({ items, categories, members, creditDefault }: { items: CatalogOption[]; categories: CategoryOption[]; members: string[]; creditDefault: string }) {
  const inCat = (cat: string) => (cat ? items.filter((i) => i.category === cat) : items);
  const [rows, setRows] = useState<Row[]>([{ key: 0, cat: "", itemId: items[0]?.id || "", delta: 1 }]);
  const [n, setN] = useState(1);

  const addRow = () => {
    setRows((r) => [...r, { key: n, cat: "", itemId: items[0]?.id || "", delta: 1 }]);
    setN((x) => x + 1);
  };
  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.cat !== undefined) next.itemId = inCat(patch.cat)[0]?.id || "";
        return next;
      })
    );
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  return (
    <form action={adjustStockAction} className="card p-4 space-y-2">
      <div className="hidden md:grid grid-cols-12 gap-2 text-xs uppercase tracking-wider text-[#8a7c64]">
        <span className="col-span-3">Section</span>
        <span className="col-span-6">Item</span>
        <span className="col-span-2">Amount</span>
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
          <select name="item_id" className="input col-span-6 md:col-span-6" value={r.itemId} onChange={(e) => setRow(r.key, { itemId: e.target.value })} required aria-label="Item">
            {inCat(r.cat).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input name="delta" type="number" value={r.delta} onChange={(e) => setRow(r.key, { delta: Number(e.target.value) })} className="input col-span-10 md:col-span-2" aria-label="Amount" title="Positive adds stock; negative only for corrections" required />
          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-3 w-10 shrink-0" title="Remove row">✕</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={addRow} className="btn-ghost !py-1 text-sm">+ Add item</button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <MemberSelect members={members} name="credit_to" defaultValue={creditDefault} label="Credit stock value to" />
        <p className="text-xs text-[#8a7c64] self-end">Positive intakes credit the member at catalogue cost (where known).</p>
      </div>
      <div className="flex justify-end">
        <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Add stock</button>
      </div>
    </form>
  );
}
