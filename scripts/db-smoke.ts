import { getDb } from "../src/db/index";
import { sales } from "../src/db/schema";

async function main() {
  const db = await getDb();
  console.log("db ok");
  const rows = await (db as unknown as { select: () => { from: (t: unknown) => Promise<unknown[]> } }).select().from(sales);
  console.log("sales rows:", (rows as unknown[]).length);
}

main().catch((e: unknown) => {
  console.error("DB FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
