import { getDb } from "../src/db/index";
import { ledger } from "../src/db/schema";

async function main() {
  const db = await getDb();
  await (db as unknown as { delete: (t: unknown) => Promise<unknown> }).delete(ledger);
  console.log("ledger cleared");
}

main().catch((e: unknown) => {
  console.error("CLEAR FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
