import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzlePg } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { resolve } from "node:path";
import { ledger, sales, stockMoves } from "../src/db/schema";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
  const local = drizzlePglite(new PGlite(resolve(process.cwd(), ".data/books")));
  const remote = drizzlePg(neon(process.env.DATABASE_URL));
  const [s, m, l] = await Promise.all([
    local.select().from(sales),
    local.select().from(stockMoves),
    local.select().from(ledger),
  ]);
  console.log(`local: ${s.length} sales, ${m.length} moves, ${l.length} ledger rows`);
  for (const row of s) await remote.insert(sales).values(row).onConflictDoNothing({ target: sales.id });
  for (const row of m) await remote.insert(stockMoves).values(row).onConflictDoNothing({ target: stockMoves.id });
  for (const row of l) await remote.insert(ledger).values(row).onConflictDoNothing({ target: ledger.id });
  console.log("migrated to Neon (existing rows untouched)");
}

main().catch((e: unknown) => {
  console.error("MIGRATE FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
