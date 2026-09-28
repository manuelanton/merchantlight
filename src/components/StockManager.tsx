"use client";
import { useMemo, useState } from "react";
import { deleteMoveAction } from "@/lib/admin-actions";

export interface MoveRow {
  id: string;
  timestamp: string;
  itemId: string;
  itemName: string;
  delta: number;
  reason: string;
  actorName: string;
  maker: string;
}

export default function StockManager({
  moves,
  counts,
  itemCategory,
  categories,
}: {
  moves: MoveRow[];
  counts: { name: string; qty: number }[];
  itemCategory: Record<string, string>;
  categories: { slug: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");

  const q = query.trim().toLowerCase();
  const match = (name: string) =>
    (!q || name.toLowerCase().includes(q)) &&
    (!cat || (itemCategory[name] || "") === cat);

  const shownCounts = useMemo(() => counts.filter((s) => match(s.name)), [counts, q, cat]);
  const shownMoves = useMemo(
    () => moves.filter((m) => match(m.itemName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [moves, q, cat]
  );

  return (
    <div className="space-y-4">
      <div className="card p-4 grid md:grid-cols-2 gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} className="input" placeholder="Search items…" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="input">
          <option value="">All sections</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      <div className="card p-4">
        <h2 className="font-display text-lg">Current stock</h2>
        <table className="ledger mt-2"><thead><tr><th>Item</th><th>On hand</th></tr></thead>
          <tbody>
            {shownCounts.map((s) => (
              <tr key={s.name}><td>{s.name}</td><td>{s.qty}</td></tr>
            ))}
            {!shownCounts.length && <tr><td colSpan={2} className="text-[#8a7c64]">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <table className="ledger min-w-[760px]">
          <thead><tr><th>When</th><th>Item</th><th>Δ</th><th>Made by</th><th>Reason</th><th>By</th><th></th></tr></thead>
          <tbody>
            {shownMoves.map((m) => {
              const locked = m.reason.startsWith("Sale (");
              return (
                <tr key={m.id}>
                  <td className="text-xs">{new Date(m.timestamp).toLocaleString()}</td>
                  <td>{m.itemName}</td>
                  <td className={m.delta >= 0 ? "text-[#7fd08a]" : "text-[#e08a8a]"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td>{m.maker || <span className="text-[#8a7c64]">—</span>}</td>
                  <td className="text-[#8a7c64]">{m.reason}</td>
                  <td>{m.actorName}</td>
                  <td>
                    {!locked ? (
                      <form action={deleteMoveAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="btn-ghost !py-1 !px-2 text-xs" type="submit" title="Delete move">✕</button>
                      </form>
                    ) : (
                      <span className="text-xs text-[#8a7c64]" title="Remove via the sale instead">🔒</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shownMoves.length && <tr><td colSpan={6} className="text-[#8a7c64]">No movements match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
