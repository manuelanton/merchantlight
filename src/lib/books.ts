import { desc } from "drizzle-orm";
import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { items, ledger, notes, sales, stockMoves } from "@/db/schema";
import { getMembers } from "@/lib/members";

export interface Books {
  salesRows: (typeof sales.$inferSelect)[];
  moveRows: (typeof stockMoves.$inferSelect)[];
  ledgerRows: (typeof ledger.$inferSelect)[];
  noteRows: (typeof notes.$inferSelect)[];
  stockByItem: Map<string, { name: string; qty: number }>;
  stockByParent: Map<string, { name: string; qty: number }>;
  revenue: number;
  profit: number;
  rentPaid: number;
  balances: [string, number][];
  /** Members for pickers = active registered members. */
  members: string[];
  /** Split roster = active registered members. */
  roster: string[];
}

export async function getBooks(): Promise<Books> {
  // Defense in depth: books data never leaves the server without a quartermaster session,
  // even if a rendering path ever evaluates without the layout gate.
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !isQuartermaster(discordId)) throw new Error("UNAUTHORIZED");
  const db = await getDb();
  // No limits: balances, revenue, and stock are cumulative sums — truncating
  // history silently corrupts them once the books outgrow the cap (ledger
  // passed 300 rows in Oct 2026 and the dashboard started lying).
  // Scale is hundreds of rows; this stays cheap for years.
  const [salesRows, moveRows, ledgerRows, noteRows, itemRows] = await Promise.all([
    db.select().from(sales).orderBy(desc(sales.timestamp)),
    db.select().from(stockMoves).orderBy(desc(stockMoves.timestamp)),
    db.select().from(ledger).orderBy(desc(ledger.timestamp)),
    db.select().from(notes).orderBy(desc(notes.timestamp)),
    db.select({ id: items.id, name: items.name, parentId: items.parentId }).from(items),
  ]);

  // Variant moves roll up into their parent: the parent carries the count.
  // stockByItem stays per exact item; stockByParent aggregates variant families.
  const parentOf = new Map(itemRows.map((i) => [i.id, i.parentId || i.id]));
  const displayName = new Map(itemRows.map((i) => [i.id, i.parentId ? (itemRows.find((p) => p.id === i.parentId)?.name || i.name) : i.name]));
  const stockByItem = new Map<string, { name: string; qty: number }>();
  const stockByParent = new Map<string, { name: string; qty: number }>();
  for (const m of [...moveRows].reverse()) {
    const cur = stockByItem.get(m.itemId) || { name: m.itemName, qty: 0 };
    cur.qty += m.delta;
    if (m.itemName) cur.name = m.itemName;
    stockByItem.set(m.itemId, cur);
    const pid = parentOf.get(m.itemId) || m.itemId;
    const par = stockByParent.get(pid) || { name: displayName.get(pid) || m.itemName, qty: 0 };
    par.qty += m.delta;
    stockByParent.set(pid, par);
  }

  const revenue = salesRows.reduce((a, s) => a + s.unitSalePrice * s.qty, 0);
  const profit = salesRows.reduce((a, s) => a + s.totalProfit, 0);
  const rentPaid = -ledgerRows
    .filter((e) => e.type === "expense" && e.category.toLowerCase() === "rent")
    .reduce((a, e) => a + e.amountGold, 0);

  const bal = new Map<string, number>();
  for (const e of ledgerRows) {
    if (!e.member.trim()) continue; // unattributed rows affect the total, not a member
    bal.set(e.member, (bal.get(e.member) || 0) + e.amountGold);
  }
  const memberRows = await getMembers();
  const activeMembers = memberRows.filter((m) => m.active && m.role !== "worker" && m.role !== "employee").map((m) => m.name);
  const activeSet = new Set(activeMembers);
  const balances = [...bal.entries()]
    .filter(([m]) => activeSet.has(m))
    .map(([m, v]) => [m, Math.floor(v)] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  // Roster = active registered members. History is untouched by roster changes.
  const roster = activeMembers;

  return { salesRows, moveRows, ledgerRows, noteRows, stockByItem, stockByParent, revenue, profit, rentPaid, balances, members: activeMembers, roster };
}
