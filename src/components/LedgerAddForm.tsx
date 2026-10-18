"use client";
import { useState } from "react";
import { addLedgerAction } from "@/lib/admin-actions";
import { SHOP } from "@/shop/config";
import ContributionForm from "./ContributionForm";
import MemberSelect from "./MemberSelect";

interface PurchRow {
  key: number;
  cat: string;
  itemId: string;
  qty: string;
}

/** Optional goods list on an expense (v2): what came in for the gold going out.
 *  Informational only — lands in the entry's description, no counts tracked. */
function PurchaseRows({
  items,
  categories,
  showHidden = false,
}: {
  items: { id: string; name: string; category: string; hidden?: boolean }[];
  categories: { slug: string; name: string }[];
  showHidden?: boolean;
}) {
  const base = showHidden ? items : items.filter((i) => !i.hidden);
  const [rows, setRows] = useState([{ key: 0, cat: "", itemId: base[0]?.id || "", qty: "1" }]);
  const [n, setN] = useState(1);
  const inCat = (cat: string, sel = "") => {
    const l = cat ? base.filter((i) => i.category === cat) : base;
    return sel && !l.some((i) => i.id === sel) ? [...l, ...items.filter((i) => i.id === sel)] : l;
  };
  const addRow = () => {
    setRows((r) => [...r, { key: n, cat: "", itemId: base[0]?.id || "", qty: "1" }]);
    setN((x) => x + 1);
  };
  const setRow = (key: number, patch: Partial<PurchRow>) =>
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
    <div className="space-y-2 border-t border-[#1c2b31] pt-3">
      <p className="text-xs text-[#8a7c64]">What came in (optional — lands in the note, no counts kept)</p>
      <div className="hidden md:grid grid-cols-12 gap-2 text-xs uppercase tracking-wider text-[#8a7c64]">
        <span className="col-span-4">Section</span>
        <span className="col-span-6">Item</span>
        <span className="col-span-2">Qty</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-12 gap-2 items-center">
          <select
            className="input col-span-12 md:col-span-4" value={r.cat}
            onChange={(e) => setRow(r.key, { cat: e.target.value })}
            aria-label="Section"
          >
            <option value="">All sections</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <select
            name="purch_item_id" className="input col-span-7 md:col-span-6"
            value={r.itemId} onChange={(e) => setRow(r.key, { itemId: e.target.value })}
            aria-label="Purchased item"
          >
            {inCat(r.cat, r.itemId).map((m) => <option key={m.id} value={m.id}>{m.name}{m.hidden ? " (not listed)" : ""}</option>)}
          </select>
          <input
            name="purch_qty" type="number" min={0.01} step="any" value={r.qty}
            onChange={(e) => setRow(r.key, { qty: e.target.value })}
            className="input col-span-3 md:col-span-1" aria-label="Quantity"
          />
          <div className="col-span-2 md:col-span-1 flex md:justify-end">
            <button type="button" onClick={() => removeRow(r.key)} className="btn-ghost !px-2.5 shrink-0" title="Remove row">✕</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addRow} className="btn-ghost !py-1 text-xs">+ Add row</button>
    </div>
  );
}
export default function LedgerAddForm({
  members,
  items,
  categories,
  showPurchase = false,
  allowPayout = true,
}: {
  members: string[];
  items: { id: string; name: string; cost: number; category: string; hidden?: boolean }[];
  categories: { slug: string; name: string }[];
  showPurchase?: boolean;
  allowPayout?: boolean;
}) {
  const [type, setType] = useState("contribution");
  const [coffers, setCoffers] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [flash, setFlash] = useState("");

  const save = async (fd: FormData) => {
    await addLedgerAction(fd);
    setFormKey((k) => k + 1);
    setCoffers(false);
    setFlash("Logged ✓");
    setTimeout(() => setFlash(""), 3000);
  };

  return (
    <form action={save} key={formKey} className="card p-5 space-y-3">
      {flash && <p className="text-sm text-[#7fd08a]">{flash}</p>}
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className="lbl">Type</label>
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="input">
            <option value="contribution">contribution (+)</option>
            <option value="expense">expense (−)</option>
            {allowPayout && <option value="payout">payout (−)</option>}
          </select>
        </div>
        {type !== "contribution" && (
          <div><label className="lbl">Amount (g)</label><input name="amount_gold" type="number" step="any" min={0} defaultValue={0} className="input" /></div>
        )}
      </div>
      {type === "contribution" ? (
        <>
          <ContributionForm members={members} items={items} categories={categories} showHidden={showHidden} />
          <div><label className="lbl">Description</label><input name="description" className="input" placeholder="e.g. opening stock from Cyllian" /></div>
        </>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={coffers} onChange={(e) => setCoffers(e.target.checked)} className="accent-[#d97a1f]" />
            Pay from company coffers (no member charged)
          </label>
          <div className="grid md:grid-cols-3 gap-3">
            {!coffers && <MemberSelect members={members} name="member" label="Member" required />}
            {coffers && <input type="hidden" name="from_coffers" value="1" />}
            <div><label className="lbl">Category</label><input name="category" className="input" placeholder="rent / materials / thread" /></div>
            <div><label className="lbl">Description</label><input name="description" className="input" placeholder="e.g. Darkwater Crossing rent, Morndas" /></div>
          </div>
          {showPurchase && <PurchaseRows items={items} categories={categories} showHidden={showHidden} />}
        </>
      )}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-[#d97a1f]" />
        Show unlisted items (raw materials not on the public catalogue)
      </label>
      <div className="flex justify-end">
        <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Add entry</button>
      </div>
    </form>
  );
}
