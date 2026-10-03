"use client";
import { useMemo, useState } from "react";
import { deleteLedgerAction, updateLedgerAction } from "@/lib/admin-actions";
import { g } from "@/lib/format";
import MemberSelect from "./MemberSelect";

export interface FeedRow {
  id: string;
  timestamp: string;
  type: string;
  member: string;
  amountGold: number;
  category: string;
  description: string;
}

export interface FeedGroup {
  key: string;
  kind: "sale" | "shared";
  when: string;
  rows: FeedRow[];
  total: number;
  title: string;
}

export type FeedEntry = { t: "single"; row: FeedRow } | { t: "group"; group: FeedGroup };

const TYPES = ["contribution", "expense", "payout"] as const;

export default function LedgerFeed({ feed, members }: { feed: FeedEntry[]; members: string[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [member, setMember] = useState("");

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      feed.filter((entry) => {
        if (entry.t === "group") {
          const gr = entry.group;
          if (type && !(
            (type === "sale_income" && gr.kind === "sale") ||
            (type === "shared" && gr.kind === "shared")
          )) return false;
          if (member && !gr.rows.some((r) => r.member === member)) return false;
          if (q && !(gr.title.toLowerCase().includes(q) || gr.rows.some((r) => (r.member + " " + r.description).toLowerCase().includes(q)))) return false;
          return true;
        }
        const e = entry.row;
        if (type && e.type !== type && !(type === "shared" && false)) return false;
        if (member && e.member !== member) return false;
        if (q && !`${e.member} ${e.description} ${e.category}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [feed, q, type, member]
  );

  return (
    <div className="space-y-3">
      <div className="card p-3 grid md:grid-cols-3 gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="input" placeholder="Search member, note, category…" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="input">
          <option value="">All types</option>
          <option value="contribution">contribution</option>
          <option value="expense">expense</option>
          <option value="payout">payout</option>
          <option value="sale_income">sale income</option>
          <option value="shared">split groups</option>
        </select>
        <select value={member} onChange={(e) => setMember(e.target.value)} className="input">
          <option value="">All members</option>
          {members.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="ledger min-w-[820px]">
          <thead><tr><th>When</th><th>Type</th><th>Member</th><th>Amount</th><th>Category</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {visible.map((entry) => {
              if (entry.t === "group") {
                const gr = entry.group;
                const pos = gr.total >= 0;
                return (
                  <tr key={gr.key}>
                    <td className="text-xs">{new Date(gr.when).toLocaleString()}</td>
                    <td>{gr.kind === "sale" ? "sale split" : "shared"}</td>
                    <td className="text-[#8a7c64]">{gr.rows.length} members</td>
                    <td className={pos ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{g(gr.total)}g</td>
                    <td>{gr.rows[0]?.category || ""}</td>
                    <td className="text-[#8a7c64]">
                      <details>
                        <summary className="cursor-pointer hover:text-[#e8dcc4]">{gr.title}</summary>
                        <ul className="mt-1 space-y-0.5 text-xs">
                          {gr.rows.map((r) => (
                            <li key={r.id} className="flex items-center gap-2">
                              <span>{r.member}: {g(r.amountGold)}g</span>
                              {gr.kind === "shared" && (
                                <form action={deleteLedgerAction} className="inline">
                                  <input type="hidden" name="id" value={r.id} />
                                  <button className="btn-ghost !py-0 !px-1.5 text-xs" type="submit" title="Delete this share">✕</button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                        {gr.kind === "sale" && (
                          <p className="text-xs mt-1">Change via voiding the sale on the Sales page.</p>
                        )}
                      </details>
                    </td>
                    <td />
                  </tr>
                );
              }
              const e = entry.row;
              return (
              <tr key={e.id}>
                <td className="text-xs">{new Date(e.timestamp).toLocaleString()}</td>
                <td>{e.type}</td>
                <td>{e.member}</td>
                <td className={e.amountGold >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{g(e.amountGold)}g</td>
                <td>{e.category}</td>
                <td className="text-[#8a7c64]">{e.description}</td>
                <td className="whitespace-nowrap">
                  <details className="inline-block">
                    <summary className="btn-ghost !py-1 !px-2 text-xs cursor-pointer list-none inline-block">Edit</summary>
                    <form action={updateLedgerAction} className="mt-2 p-3 card space-y-2 min-w-[240px]">
                      <input type="hidden" name="id" value={e.id} />
                      <div><MemberSelect members={members} name="member" defaultValue={e.member} label="Member" /></div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" name="from_coffers" value="1" defaultChecked={e.member === ""} className="accent-[#d97a1f]" />
                        Company coffers (no member)
                      </label>
                      <div><label className="lbl">Type</label>
                        <select name="type" defaultValue={e.type} className="input">
                          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          {!(TYPES as readonly string[]).includes(e.type) && (
                            <option value={e.type}>{e.type} (auto)</option>
                          )}
                        </select>
                      </div>
                      <div><label className="lbl">Amount (g)</label><input name="amount_gold" type="number" step="any" defaultValue={Math.abs(e.amountGold)} className="input" /></div>
                      <div><label className="lbl">Category</label><input name="category" defaultValue={e.category} className="input" /></div>
                      <div><label className="lbl">Description</label><input name="description" defaultValue={e.description} className="input" /></div>
                      <button className="btn-gold !py-1 w-full text-sm" type="submit">Save</button>
                    </form>
                  </details>{" "}
                  <form action={deleteLedgerAction} className="inline-block">
                    <input type="hidden" name="id" value={e.id} />
                    <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete entry">✕</button>
                  </form>
                </td>
              </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={7} className="text-[#8a7c64]">Nothing matches — clear search or filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
