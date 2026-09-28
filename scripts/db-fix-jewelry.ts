import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { categories } from "../src/db/schema";

async function main() {
  const db = await getDb();
  await db.update(categories)
    .set({ name: "Jewelry", icon: "💍", sortOrder: 10 })
    .where(eq(categories.slug, "jewelry"));
  console.log("jewelry fixed");
}

main().catch((e: unknown) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
