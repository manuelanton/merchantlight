import { getDb } from "../src/db/index";
import { ledger } from "../src/db/schema";

const uid = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function main() {
  const db = await getDb();
  await db.insert(ledger).values([
    {
      id: uid("lg"),
      type: "contribution",
      member: "Cyllian Braehn",
      amountGold: 1500,
      category: "seed capital",
      description: "Initial put-in (>1.5k)",
      actorDiscordId: "",
    },
    {
      id: uid("lg"),
      type: "expense",
      member: "Cyllian Braehn",
      amountGold: -250,
      category: "materials",
      description: "Bars for fancy bags (gold/silver, Namhar Winterhold 15g each 10+)",
      actorDiscordId: "",
    },
  ]);
  console.log("opening balances logged");
}

main().catch((e: unknown) => {
  console.error("SEED FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
