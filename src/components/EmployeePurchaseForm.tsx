"use client";
import { useState } from "react";
import { logEmployeePurchaseAction } from "@/lib/admin-actions";
import { g } from "@/lib/format";

export default function EmployeePurchaseForm({ items }: { items: any[] }) {
  const [itemId, setItemId] = useState("");
  const item = items.find((i) => i.id === itemId);
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const cost = Number(qty || 0) * Number(unit || 0);
  return (
    <form action={logEmployeePurchaseAction} className="card p-4 space-y-2">
      <div className="grid md:grid-cols-4 gap-2">
        <select className="input" value={itemId} onChange={(e) => { setItemId(e.target.value); const it = items.find((i) => i.id === e.target.value); if (it) setUnit(String(it.sale_price || 0)); }}>
          <option value="">Freeform / other</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input className="input" name="item_name" defaultValue={item?.name || ""} placeholder="Item name" required />
        <input className="input" name="qty" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
        <input className="input" name="unit_cost" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit cost (g)" />
      </div>
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="cost_total" value={cost} />
      <input className="input" name="notes" placeholder="Notes" />
      <button className="btn-gold">Log purchase</button>
      {cost > 0 && <div className="text-sm text-[#8a7c64]">Total: {g(cost)}g</div>}
    </form>
  );
}