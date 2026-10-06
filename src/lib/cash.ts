import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { cashMoves, cashPots } from "@/db/schema";

export async function getCash(): Promise<{ pots: { name: string; balance: number }[]; moves: (typeof cashMoves.$inferSelect)[] }> {
  const db = await getDb();
  const [pots, moves] = await Promise.all([
    db.select().from(cashPots),
    db.select().from(cashMoves).orderBy(desc(cashMoves.timestamp)).limit(50),
  ]);
  const bals = new Map<string, number>();
  for (const m of moves) bals.set(m.pot, (bals.get(m.pot) || 0) + m.delta);
  return {
    pots: pots.map((p) => ({ name: p.name, balance: Math.round((bals.get(p.name) || 0) * 100) / 100 })),
    moves,
  };
}
