"use client";

import { useState } from "react";
import SuggestInput from "@/components/SuggestInput";
import { g } from "@/lib/format";
import type { EecItem } from "@/lib/store-data";

/** Name and item for an EEC order. `catalogue` also lists everything that can be ordered. */
export default function CommissionForm({ items, action, catalogue = false, button }: {
  items: EecItem[];
  action: (form: FormData) => Promise<void>;
  catalogue?: boolean;
  button: string;
}) {
  const [id, setId] = useState("");
  const item = items.find((i) => i.id === id);
  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <>
      <form action={action} className="panel p-4 mb-6 grid sm:grid-cols-[1fr_1.5fr_auto] gap-3 items-end">
        <div>
          <label className="lbl" htmlFor="commission-customer">Customer name</label>
          <input id="commission-customer" name="customer" maxLength={60} className="input !py-2 text-sm" required />
        </div>
        <div>
          <label className="lbl" htmlFor="commission-item">Item</label>
          <SuggestInput
            key={item?.id}
            id="commission-item"
            label="Item"
            placeholder="Search the EEC list"
            defaultValue={item?.name}
            options={items.map((i) => i.name)}
            onPick={(name) => setId(items.find((i) => i.name === name)?.id ?? "")}
          />
        </div>
        <button className="btn-gold !py-2 text-sm" type="submit" disabled={!item}>{button}</button>
        <input type="hidden" name="item" value={id} />
        {/* Left empty by people; bots filling every field are turned away. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        {item && (
          <p className="sm:col-span-3 text-sm">
            {item.name}: <span className="tabular-nums text-[#e0bd4a]">{g(item.price)}g</span>
            {item.weekly_limit && <span className="muted"> · at most {item.weekly_limit} a week</span>}
          </p>
        )}
      </form>

      {catalogue && categories.map((c) => (
        <section key={c} className="mb-6">
          <h2 className="eyebrow mb-2">{c}</h2>
          <div className="panel divide-y divide-[#1c2b31]">
            {items.filter((i) => i.category === c).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">{i.name}{i.weekly_limit && <span className="muted text-xs"> · at most {i.weekly_limit} a week</span>}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="tabular-nums">{g(i.price)}g</span>
                  <button
                    type="button"
                    className={`${i.id === id ? "btn-gold" : "btn-ghost"} !py-1 text-sm`}
                    aria-label={`Choose ${i.name}`}
                    onClick={() => {
                      setId(i.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Choose
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
