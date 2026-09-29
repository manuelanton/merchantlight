"use client";
import { useState } from "react";
import { addIngredientAction } from "@/lib/admin-actions";

interface Row {
  key: number;
  materialId: string;
  qty: number;
}

export default function IngredientForm({
  itemId,
  materials,
}: {
  itemId: string;
  materials: { id: string; name: string; cost: number }[];
}) {
  const [rows, setRows] = useState<Row[]>([{ key: 0, materialId: materials[0]?.id || "", qty: 1 }]);
  const [n, setN] = useState(1);

  const addRow = () => {
    setRows((r) => [...r, { key: n, materialId: materials[0]?.id || "", qty: 1 }]);
    setN((x) => x + 1);
  };
  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  if (!materials.length) return <p className="text-xs text-[#8a7c64]">No materials in the catalogue yet.</p>;

  return (
    <form action={addIngredientAction} className="space-y-2">
      <input type="hidden" name="item_id" value={itemId} />
      {rows.map((r) => (
        <div key={r.key} className="flex gap-2 items-center">
          <select
            name="material_item_id" className="input flex-1"
            value={r.materialId} onChange={(e) => setRow(r.key, { materialId: e.target.value })}
            aria-label="Material" required
          >
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}{m.cost ? ` (${m.cost}g)` : ""}</option>)}
          </select>
          <input
            name="qty" type="number" min={0.01} step="any" value={r.qty}
            onChange={(e) => setRow(r.key, { qty: Number(e.target.value) })}
            className="input w-20" aria-label="Quantity"
          />
          <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-2.5 shrink-0" title="Remove row">✕</button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button type="button" onClick={addRow} className="btn-ghost !py-1 text-xs">+ Add row</button>
        <button className="btn-gold !py-1 text-xs ml-auto" type="submit">Save ingredients</button>
      </div>
    </form>
  );
}
