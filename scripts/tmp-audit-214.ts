import { getDb } from "../src/db/index";
import { ledger } from "../src/db/schema";

async function main() {
  const db = await getDb();
  const rows = await db.select().from(ledger);
  const rent = rows.filter((e) => /214g/i.test(e.description));
  for (const e of rent) {
    console.log([new Date(e.timestamp).toISOString(), e.type, e.member, e.amountGold, e.id, e.description.slice(0, 90)].join(" | "));
  }
  console.log("214-rows:", rent.length);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
