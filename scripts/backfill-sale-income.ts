import { getDb } from "../src/db/index";
import { ledger, sales } from "../src/db/schema";

const uid = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function main() {
  const db = await getDb();
  const [saleRows, ledgerRows] = await Promise.all([
    db.select().from(sales),
    db.select().from(ledger),
  ]);
  let posted = 0;
  for (const s of saleRows) {
    const revenue = s.unitSalePrice * s.qty;
    if (!revenue) continue;
    const desc = `Sale at ${s.location}: ${s.itemName} × ${s.qty}`;
    const dup = ledgerRows.some(
      (e) => e.type === "sale_income" && e.description.startsWith(desc) && e.amountGold === revenue
    );
    if (dup) continue;
    await db.insert(ledger).values({
      id: uid("lg"),
      type: "sale_income",
      member: s.soldByName,
      amountGold: revenue,
      category: "sales",
      description: desc,
      actorDiscordId: s.soldByDiscordId,
    });
    posted++;
  }
  console.log(`backfilled ${posted} sale_income entries (${saleRows.length} sales total)`);
}

main().catch((e: unknown) => {
  console.error("BACKFILL FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
