"use client";

import { useState } from "react";
import { createPurchaseAction } from "@/lib/store-actions";

interface Option {
  kind: "good" | "material";
  id: string;
  label: string;
  cost: number;
  stock: number;
}

interface Line {
  key: number;
  label: string;
  qty: string;
  price: string;
}

const blank = (key: number): Line => ({ key, label: "", qty: "1", price: "" });
const toNumber = (s: string) => Number(s.replace(",", ".")) || 0;

/** Same shape as a receipt: lines pick an item by name, the price fills in from its cost. */
export default function PurchaseForm({ options }: { options: Option[] }) {
  const [lines, setLines] = useState<Line[]>([blank(0)]);
  const byLabel = new Map(options.map((o) => [o.label, o]));

  const update = (key: number, patch: Partial<Line>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (key: number, label: string) => {
    const option = byLabel.get(label);
    update(key, option ? { label, price: String(option.cost) } : { label });
  };

  const payload = lines
    .filter((l) => byLabel.has(l.label) && toNumber(l.qty) > 0)
    .map((l) => {
      const option = byLabel.get(l.label)!;
      return { kind: option.kind, item_id: option.id, qty: toNumber(l.qty), unit_price: toNumber(l.price) };
    });
  const total = payload.reduce((sum, l) => sum + l.qty * l.unit_price, 0);

  return (
    <form action={createPurchaseAction} className="panel p-4 space-y-4">
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <datalist id="purchase-items">
        {options.map((o) => <option key={o.label} value={o.label} />)}
      </datalist>

      {lines.map((l) => {
        const option = byLabel.get(l.label);
        return (
          <div key={l.key} className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[1fr_4.5rem_5.5rem_auto] gap-2 items-end">
            <div className="min-w-0 col-span-3 sm:col-span-1">
              <label className="lbl" htmlFor={`buy-${l.key}`}>Item</label>
              <input id={`buy-${l.key}`} list="purchase-items" className="input" value={l.label} onChange={(e) => pick(l.key, e.target.value)} placeholder="Type to search" autoComplete="off" />
            </div>
            <div>
              <label className="lbl" htmlFor={`buy-qty-${l.key}`}>Qty</label>
              <input id={`buy-qty-${l.key}`} inputMode="decimal" className="input" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
            </div>
            <div>
              <label className="lbl" htmlFor={`buy-price-${l.key}`}>Cost</label>
              <input id={`buy-price-${l.key}`} inputMode="decimal" className="input" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} />
            </div>
            <button type="button" className="btn-ghost !px-3" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))}>×</button>
            {option && <p className="col-span-3 sm:col-span-4 muted text-xs">In stock: {option.stock}, after this purchase {option.stock + toNumber(l.qty)}</p>}
          </div>
        );
      })}
      <button type="button" className="btn-ghost !py-1 text-sm" onClick={() => setLines((all) => [...all, blank(Math.max(...all.map((l) => l.key)) + 1)])}>+ Add line</button>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="lbl" htmlFor="supplier">Supplier</label>
          <input id="supplier" name="supplier" className="input" placeholder="Optional" />
        </div>
        <div>
          <label className="lbl" htmlFor="purchase-notes">Notes</label>
          <input id="purchase-notes" name="notes" className="input" placeholder="Optional" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" name="update_prices" value="1" defaultChecked className="accent-[#d97a1f]" />
          Save as the item&apos;s new cost
        </label>
        <div className="flex items-center gap-4">
          <span className="text-xl text-[#e0bd4a] tabular-nums">{Math.round(total * 100) / 100}g</span>
          <button className="btn-gold !py-2 text-sm" type="submit" disabled={!payload.length}>Buy</button>
        </div>
      </div>
    </form>
  );
}
