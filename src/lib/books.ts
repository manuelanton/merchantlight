import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { ledger, sales, stockMoves } from "@/db/schema";

export interface Books {
  salesRows: (typeof sales.$inferSelect)[];
  moveRows: (typeof stockMoves.$inferSelect)[];
  ledgerRows: (typeof ledger.$inferSelect)[];
  stockByItem: Map<string, { name: string; qty: number }>;
  revenue: number;
  profit: number;
  rentPaid: number;
  balances: [string, number][];
}

export async function getBooks(): Promise<Books> {
  const db = await getDb();
  const [salesRows, moveRows, ledgerRows] = await Promise.all([
    db.select().from(sales).orderBy(desc(sales.timestamp)).limit(200),
    db.select().from(stockMoves).orderBy(desc(stockMoves.timestamp)).limit(300),
    db.select().from(ledger).orderBy(desc(ledger.timestamp)).limit(300),
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

  return { salesRows, moveRows, ledgerRows, stockByItem, revenue, profit, rentPaid, balances };
}
