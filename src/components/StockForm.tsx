"use client";
import { useState } from "react";
import { adjustStockAction } from "@/lib/admin-actions";
import ItemPicker from "./ItemPicker";
import type { CatalogOption, CategoryOption } from "./SaleForm";
interface Row {
  key: number;
  cat: string;
  itemId: string;
  delta: string;
}

export default function StockForm({ items, categories }: { items: CatalogOption[]; categories: CategoryOption[] }) {
  const inCat = (cat: string) => (cat ? items.filter((i) => i.category === cat) : items);
  const [rows, setRows] = useState<Row[]>([{ key: 0, cat: "", itemId: items[0]?.id || "", delta: "1" }]);
  const [n, setN] = useState(1);

  const addRow = () => {
    setRows((r) => [...r, { key: n, cat: "", itemId: items[0]?.id || "", delta: "1" }]);
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
  const [flash, setFlash] = useState("");

  const save = async (fd: FormData) => {
    await adjustStockAction(fd);
    setRows([{ key: n + 1, cat: "", itemId: items[0]?.id || "", delta: "1" }]);
    setN((x) => x + 2);
    setFlash("Logged ✓");
    setTimeout(() => setFlash(""), 3000);
  };

  return (
    <form action={save} className="card p-4 space-y-2">
      {flash && <p className="text-sm text-[#7fd08a]">{flash}</p>}
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
          <ItemPicker
            items={items.map((i) => ({ ...i, parent: i.parent ? (items.find((p) => p.id === i.parent)?.name || null) : null }))}
            cat={r.cat} value={r.itemId}
            onChange={(id) => setRow(r.key, { itemId: id })}
            className="input col-span-6 md:col-span-6"
          />
          <input name="delta" type="number" step="any" value={r.delta} onChange={(e) => setRow(r.key, { delta: e.target.value })} className="input col-span-10 md:col-span-2" aria-label="Amount" title="Positive adds stock; negative only for corrections" required />
          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-3 w-10 shrink-0" title="Remove row">✕</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={addRow} className="btn-ghost !py-1 text-sm">+ Add item</button>
      </div>
      <p className="text-xs text-[#8a7c64] self-end">Stock goes to the shared pot — sale profits split evenly, no individual credit.</p>
      <div className="flex justify-end">
        <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Add stock</button>
      </div>
    </form>
  );
}
