"use client";
import { useState } from "react";
import { createItemAction } from "@/lib/admin-actions";

interface Row {
  key: number;
  materialId: string;
  qty: string;
}

export default function AddItemForm({
  categories,
  materials,
}: {
  categories: { slug: string; name: string }[];
  materials: { id: string; name: string; cost: number }[];
}) {
  const [withRecipe, setWithRecipe] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ key: 0, materialId: materials[0]?.id || "", qty: "1" }]);
  const [n, setN] = useState(1);

  const addRow = () => {
    setRows((r) => [...r, { key: n, materialId: materials[0]?.id || "", qty: "1" }]);
    setN((x) => x + 1);
  };
  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  return (
    <form action={createItemAction} className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className="lbl">Name *</label><input name="name" required className="input" placeholder="Fine Leather Boots" /></div>
        <div><label className="lbl">Category</label>
          <select name="category_slug" className="input">{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
        </div>
        <div><label className="lbl">Visible</label>
          <select name="active" className="input"><option value="true">Yes</option><option value="false">Hidden</option></select>
        </div>
        <div><label className="lbl">Price (g)</label><input name="sale_price" type="number" step="any" min={0} defaultValue={0} className="input" /></div>
        <div><label className="lbl">Cost (g, private)</label><input name="cost_value" type="number" step="any" min={0} defaultValue={0} className="input" /></div>
        <div><label className="lbl">Description</label><input name="description" className="input" placeholder="Materials, bulk rates…" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={withRecipe} onChange={(e) => setWithRecipe(e.target.checked)} className="accent-[#d97a1f]" />
        Add recipe now (materials only)
      </label>
      {withRecipe && (
        <div className="space-y-2 border-t border-[#1c2b31] pt-3">
          {rows.map((r) => (
            <div key={r.key} className="space-y-2 border-b border-[#1c2b31] pb-2">
              <select
                name="material_item_id" className="input w-full"
                value={r.materialId} onChange={(e) => setRow(r.key, { materialId: e.target.value })}
                aria-label="Material"
              >
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}{m.cost ? ` (${m.cost}g)` : ""}</option>)}
              </select>
              <div className="flex gap-2 items-center">
                <input
                  name="qty" type="number" min={0.01} step="any" value={r.qty}
                  onChange={(e) => setRow(r.key, { qty: e.target.value })}
                  className="input w-24" aria-label="Quantity"
                />
                <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-2.5 shrink-0" title="Remove row">✕</button>
              </div>
            </div>
          ))}
          {materials.length > 0 ? (
            <button type="button" onClick={addRow} className="btn-ghost !py-1 text-xs">+ Add row</button>
          ) : (
            <p className="text-xs text-[#8a7c64]">No materials in the catalogue yet.</p>
          )}
        </div>
      )}
      <button className="btn-gold" type="submit">Add item</button>
    </form>
  );
}
