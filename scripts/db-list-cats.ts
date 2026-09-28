import { getDb } from "../src/db/index";
import { categories } from "../src/db/schema";

async function main() {
  const db = await getDb();
  const rows = await db.select().from(categories);
  for (const r of rows) console.log([r.slug, JSON.stringify(r.name), r.icon, r.sortOrder].join(" | "));
}

main().catch((e: unknown) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
