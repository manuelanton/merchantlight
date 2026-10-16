import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cashMoves, cashPots, settings } from "@/db/schema";

export async function getCash(): Promise<{ pots: { name: string; balance: number }[]; moves: (typeof cashMoves.$inferSelect)[]; floor: number }> {
  const db = await getDb();
  const [pots, moves, floorRows] = await Promise.all([
    db.select().from(cashPots),
    db.select().from(cashMoves).orderBy(desc(cashMoves.timestamp)).limit(50),
    db.select().from(settings).where(eq(settings.key, "coffers_floor")).limit(1),
  ]);
  const bals = new Map<string, number>();
  for (const m of moves) bals.set(m.pot, (bals.get(m.pot) || 0) + m.delta);
  return {
    pots: pots.map((p) => ({ name: p.name, balance: Math.round((bals.get(p.name) || 0) * 100) / 100 })),
    moves,
    floor: Number(floorRows[0]?.value || 0),
  };
}

/** Set the coffers floor: dashboard cash turns red below it. */
export async function setCoffersFloor(floor: number, db?: Awaited<ReturnType<typeof getDb>>) {
  const d = db || (await getDb());
  const rows = await d.select().from(settings).where(eq(settings.key, "coffers_floor")).limit(1);
  const value = String(Math.max(0, Math.round(floor * 100) / 100));
  if (rows.length) {
    await d.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, "coffers_floor"));
  } else {
    await d.insert(settings).values({ key: "coffers_floor", value });
  }
}
