import { getBooks } from "@/lib/books";
import { g } from "@/lib/format";
import { getCatalogue } from "@/lib/catalog";
import LedgerAddForm from "@/components/LedgerAddForm";
import LedgerFeed, { type FeedEntry } from "@/components/LedgerFeed";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const b = await getBooks();
  const { categories, items } = await getCatalogue();
  const bal = b.ledgerRows.reduce((a, e) => a + e.amountGold, 0);

  type Row = (typeof b.ledgerRows)[number];
  interface Group {
    key: string;
    kind: "sale" | "shared";
    when: string;
    rows: Row[];
    total: number;
    title: string;
  }
  // Collapse auto-posted split shares into one expandable row per sale / bill.
  const singles: Row[] = [];
  const groups = new Map<string, Group>();
  const groupOrder: string[] = [];
  const saleToken = (d: string) => d.match(/\[sale:([^\]]+)\]/)?.[1];
  // Shared bills (rent splits, shared costs): same text modulo the share tag,
  // with or without parentheses around it.
  const SHARE_TAG = /:?\s*\(?share \d+ of \d+[^)]*\)?/i;
  const sharedBill = (d: string) => {
    if (!/share \d+ of \d+/i.test(d)) return null;
    return d.replace(SHARE_TAG, "").trim();
  };
  const groupKeyFor = (e: Row): string | null => {
    if (e.type === "sale_income") {
      const tok = saleToken(e.description);
      return tok ? `sale:${tok}` : null;
    }
    const bill = sharedBill(e.description);
    // Include the bill total: two different bills with the same wording must not merge.
    if (!bill) return null;
    const total = e.description.match(/of ([\d.]+)g/i)?.[1] || "?";
    return `shared:${bill}::${total}`;
  };
  const groupTitleFor = (kind: Group["kind"], rows: Row[]): string => {
    if (kind === "sale") {
      return rows[0]?.description.replace(/\[sale:[^\]]+\]:\s*/, "").replace(/\s*\(share \d+ of \d+\)\s*$/, "") || "Sale";
    }
    const first = rows[0]?.description || "";
    const total = first.match(/of ([\d.]+)g/i)?.[1];
    const what = first.replace(SHARE_TAG, "").replace(/^(Shared|Rent split:?)\s*/i, "").trim() || first.replace(SHARE_TAG, "").trim();
    return total ? `${what} — split of ${total}g` : what || "Shared cost";
  };
  for (const e of b.ledgerRows) {
    const key = groupKeyFor(e);
    if (!key) {
      singles.push(e);
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, {
        key, kind: key.startsWith("sale:") ? "sale" : "shared",
        when: String(e.timestamp), rows: [], total: 0, title: "",
      });
      groupOrder.push(key);
    }
    const gr = groups.get(key)!;
    gr.rows.push(e);
    gr.total += e.amountGold;
  }
  // Interleave back into time order (rows come newest-first).
  const order = new Map<string, number>();
  b.ledgerRows.forEach((e, i) => {
    const k = groupKeyFor(e) || `row:${e.id}`;
    if (!order.has(k)) order.set(k, i);
  });
  for (const gr of groups.values()) {
    if (!gr.title) gr.title = groupTitleFor(gr.kind, gr.rows);
  }
  const feed: ({ t: "single"; row: Row } | { t: "group"; group: Group })[] = [
    ...singles.map((row) => ({ t: "single" as const, row })),
    ...groupOrder.map((k) => ({ t: "group" as const, group: groups.get(k)! })),
  ].sort((a, c) => {
    const ka = a.t === "single" ? `row:${a.row.id}` : a.group.key;
    const kc = c.t === "single" ? `row:${c.row.id}` : c.group.key;
    return (order.get(ka) ?? 0) - (order.get(kc) ?? 0);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl">Ledger — contributions, expenses, rent, payouts</h1>
        <a href="/api/admin/ledger" download className="btn-ghost !py-1 text-xs ml-auto whitespace-nowrap">Download JSON</a>
      </div>
      <p className="text-sm text-[#8a7c64]">
        Balance: <b className="text-[#e0bd4a]">{g(bal)}g</b> · Rent paid so far:{" "}
        <b className="text-[#e0bd4a]">{g(b.rentPaid)}g</b> (type <i>expense</i> + category <i>rent</i> splits evenly across members automatically).
      </p>

      <LedgerAddForm
        members={b.members}
        items={items.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, cost: i.cost_value > 0 ? i.cost_value : i.sale_price, category: i.category_slug }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      />

      <LedgerFeed
        feed={feed.map((entry): FeedEntry => {
          if (entry.t === "group") {
            const gr = entry.group;
            return {
              t: "group",
              group: {
                key: gr.key, kind: gr.kind, when: gr.when, total: gr.total, title: gr.title,
                rows: gr.rows.map((r) => ({
                  id: r.id, timestamp: String(r.timestamp), type: r.type, member: r.member,
                  amountGold: r.amountGold, category: r.category, description: r.description,
                })),
              },
            };
          }
          const e = entry.row;
          return {
            t: "single",
            row: {
              id: e.id, timestamp: String(e.timestamp), type: e.type, member: e.member,
              amountGold: e.amountGold, category: e.category, description: e.description,
            },
          };
        })}
        members={b.members}
      />
    </div>
  );
}