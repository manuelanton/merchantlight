import { desc } from "drizzle-orm";
import { auth, isQuartermaster } from "@/auth";
import { getDb } from "@/db";
import { ledger, notes, sales, stockMoves } from "@/db/schema";

export interface Books {
  salesRows: (typeof sales.$inferSelect)[];
  moveRows: (typeof stockMoves.$inferSelect)[];
  ledgerRows: (typeof ledger.$inferSelect)[];
  noteRows: (typeof notes.$inferSelect)[];
  stockByItem: Map<string, { name: string; qty: number }>;
  revenue: number;
  profit: number;
  rentPaid: number;
  balances: [string, number][];
  /** Everyone who ever touched the ledger. Newcomers appear with their first entry. */
  members: string[];
  /** Split roster: members with nonzero net. Newcomers join future splits on their first nonzero entry; history never re-splits. */
  roster: string[];
}

export async function getBooks(): Promise<Books> {
  // Defense in depth: books data never leaves the server without a quartermaster session,
  // even if a rendering path ever evaluates without the layout gate.
  const session = await auth();
  const discordId = (session as unknown as { discordId?: string } | null)?.discordId;
  if (!session?.user || !isQuartermaster(discordId)) throw new Error("UNAUTHORIZED");
  const db = await getDb();
  const [salesRows, moveRows, ledgerRows, noteRows] = await Promise.all([
    db.select().from(sales).orderBy(desc(sales.timestamp)).limit(200),
    db.select().from(stockMoves).orderBy(desc(stockMoves.timestamp)).limit(300),
    db.select().from(ledger).orderBy(desc(ledger.timestamp)).limit(300),
    db.select().from(notes).orderBy(desc(notes.timestamp)).limit(100),
  ]);

  const stockByItem = new Map<string, { name: string; qty: number }>();
  for (const m of [...moveRows].reverse()) {
    const cur = stockByItem.get(m.itemId) || { name: m.itemName, qty: 0 };
    cur.qty += m.delta;
    if (m.itemName) cur.name = m.itemName;
    stockByItem.set(m.itemId, cur);
  }

  const revenue = salesRows.reduce((a, s) => a + s.unitSalePrice * s.qty, 0);
  const profit = salesRows.reduce((a, s) => a + s.totalProfit, 0);
  const rentPaid = -ledgerRows
    .filter((e) => e.type === "expense" && e.category.toLowerCase() === "rent")
    .reduce((a, e) => a + e.amountGold, 0);

  const bal = new Map<string, number>();
  for (const e of ledgerRows) bal.set(e.member, (bal.get(e.member) || 0) + e.amountGold);
  const balances = [...bal.entries()].sort((a, b) => b[1] - a[1]);

  // Roster: members with at least one nonzero entry. Zero-only placeholder rows don't dilute splits.
  const roster = [...bal.entries()].filter(([, v]) => v !== 0).map(([m]) => m).sort();

  return { salesRows, moveRows, ledgerRows, noteRows, stockByItem, revenue, profit, rentPaid, balances, members: [...bal.keys()].sort(), roster };
}
