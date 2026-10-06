"use client";
import { useState } from "react";
import { addLedgerAction } from "@/lib/admin-actions";
import ContributionForm from "./ContributionForm";
import MemberSelect from "./MemberSelect";
export default function LedgerAddForm({
  members,
  items,
  categories,
}: {
  members: string[];
  items: { id: string; name: string; cost: number; category: string }[];
  categories: { slug: string; name: string }[];
}) {
  const [type, setType] = useState("contribution");
  const [coffers, setCoffers] = useState(false);
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
            <option value="payout">payout (−)</option>
          </select>
        </div>
        {type !== "contribution" && (
          <div><label className="lbl">Amount (g)</label><input name="amount_gold" type="number" step="any" min={0} defaultValue={0} className="input" /></div>
        )}
      </div>
      {type === "contribution" ? (
        <>
          <ContributionForm members={members} items={items} categories={categories} />
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
        </>
      )}
      <div className="flex justify-end">
        <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Add entry</button>
      </div>
    </form>
  );
}
