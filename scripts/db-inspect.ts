import { getDb } from "../src/db/index";
import { ledger, sales } from "../src/db/schema";

async function main() {
  const db = await getDb();
  const [s, l] = await Promise.all([db.select().from(sales), db.select().from(ledger)]);
  console.log("--- sales ---");
  for (const r of s) console.log([r.itemName, r.qty, r.unitSalePrice, r.soldByName, r.soldByDiscordId].join(" | "));
  console.log("--- ledger ---");
  for (const e of l) console.log([e.type, e.member, e.amountGold, e.category, e.description].join(" | "));
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
