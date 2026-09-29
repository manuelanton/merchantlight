"use client";
import { useState } from "react";
import { addLedgerAction } from "@/lib/admin-actions";
import ContributionForm from "./ContributionForm";
import MemberSelect from "./MemberSelect";

export default function LedgerAddForm({
  members,
  items,
}: {
  members: string[];
  items: { id: string; name: string; cost: number }[];
}) {
  const [type, setType] = useState("contribution");

  return (
    <form action={addLedgerAction} className="card p-5 space-y-3">
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
          <ContributionForm members={members} items={items} />
          <div><label className="lbl">Description</label><input name="description" className="input" placeholder="e.g. opening stock from Cyllian" /></div>
        </>
      ) : (
        <div className="grid md:grid-cols-3 gap-3">
          <MemberSelect members={members} name="member" label="Member" required />
          <div><label className="lbl">Category</label><input name="category" className="input" placeholder="rent / materials / thread" /></div>
          <div><label className="lbl">Description</label><input name="description" className="input" placeholder="e.g. Gallow's Rock rent, Morndas" /></div>
        </div>
      )}
      <div className="flex justify-end">
        <button className="btn-gold !py-2 !px-5 text-sm" type="submit">Add entry</button>
      </div>
    </form>
  );
}
