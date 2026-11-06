"use client";

import { useState } from "react";
import { createReceiptAction } from "@/lib/store-actions";

interface Item {
  id: string;
  name: string;
  price: number;
  stock: number;
}

interface Line {
  key: number;
  name: string;
  qty: string;
  price: string;
}

const blank = (key: number): Line => ({ key, name: "", qty: "1", price: "" });
const toNumber = (s: string) => Number(s.replace(",", ".")) || 0;

/** Lines pick an item by name; the price fills in and can be changed. */
export default function ReceiptForm({ items }: { items: Item[] }) {
  const [lines, setLines] = useState<Line[]>([blank(0)]);
  const [discount, setDiscount] = useState("");
  const byName = new Map(items.map((i) => [i.name, i]));

  const update = (key: number, patch: Partial<Line>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (key: number, name: string) => {
    const item = byName.get(name);
    update(key, item ? { name, price: String(item.price) } : { name });
  };

  const valid = lines.filter((l) => byName.has(l.name) && toNumber(l.qty) > 0);
  const payload = valid.map((l) => ({ good_id: byName.get(l.name)!.id, qty: toNumber(l.qty), unit_price: toNumber(l.price) }));
  const subtotal = payload.reduce((sum, l) => sum + l.qty * l.unit_price, 0);
  const total = Math.max(0, subtotal - toNumber(discount));

  return (
    <form action={createReceiptAction} className="space-y-6">
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <datalist id="receipt-items">
        {items.map((i) => <option key={i.id} value={i.name} />)}
      </datalist>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="lbl" htmlFor="customer">Customer</label>
          <input id="customer" name="customer" className="input" placeholder="Optional" />
        </div>
        <div>
          <label className="lbl" htmlFor="notes">Notes</label>
          <input id="notes" name="notes" className="input" placeholder="Optional" />
        </div>
      </div>

      <div className="panel divide-y divide-[#1c2b31]">
        {lines.map((l) => {
          const item = byName.get(l.name);
          return (
            <div key={l.key} className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[1fr_4.5rem_5.5rem_auto] gap-2 p-3 items-end">
              <div className="min-w-0 col-span-3 sm:col-span-1">
                <label className="lbl" htmlFor={`item-${l.key}`}>Item</label>
                <input id={`item-${l.key}`} list="receipt-items" className="input" value={l.name} onChange={(e) => pick(l.key, e.target.value)} placeholder="Type to search" autoComplete="off" />
              </div>
              <div>
                <label className="lbl" htmlFor={`qty-${l.key}`}>Qty</label>
                <input id={`qty-${l.key}`} inputMode="decimal" className="input" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
              </div>
              <div>
                <label className="lbl" htmlFor={`price-${l.key}`}>Price</label>
                <input id={`price-${l.key}`} inputMode="decimal" className="input" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} />
              </div>
              <button type="button" className="btn-ghost !px-3" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))}>×</button>
              {item && toNumber(l.qty) > item.stock && (
                <p className="col-span-3 sm:col-span-4 text-xs text-[#e0bd4a]">Only {item.stock} in stock. The sale still goes through.</p>
              )}
            </div>
          );
        })}
        <div className="p-3">
          <button type="button" className="btn-ghost !py-1 text-sm" onClick={() => setLines((all) => [...all, blank(Math.max(...all.map((l) => l.key)) + 1)])}>+ Add line</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="lbl" htmlFor="discount">Discount</label>
          <input id="discount" name="discount" inputMode="decimal" className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="lbl" htmlFor="tip">Tip</label>
          <input id="tip" name="tip" inputMode="decimal" className="input" placeholder="0" />
        </div>
        <div className="text-right">
          <div className="eyebrow">Total</div>
          <div className="text-2xl text-[#e0bd4a] tabular-nums">{Math.round(total * 100) / 100}g</div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button className="btn-ghost" type="submit" name="post" value="0" disabled={!payload.length}>Save draft</button>
        <button className="btn-gold" type="submit" name="post" value="1" disabled={!payload.length}>Post receipt</button>
      </div>
    </form>
  );
}
