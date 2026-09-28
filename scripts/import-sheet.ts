import { getDb } from "../src/db/index";
import { categories, items } from "../src/db/schema";
import { getCatalogue } from "../src/lib/sheets";

async function main() {
  const db = await getDb();
  const { categories: cats, items: sheetItems } = await getCatalogue();

  let catCount = 0;
  for (const c of cats) {
    await db.insert(categories).values({
      id: c.slug, name: c.name, slug: c.slug, icon: c.icon, sortOrder: c.sort_order,
    }).onConflictDoNothing({ target: categories.slug });
    catCount++;
  }

  let itemCount = 0;
  for (const i of sheetItems) {
    await db.insert(items).values({
      id: i.id, // generated-from-name ids preserved, so existing books keep linking
      name: i.name,
      categorySlug: i.category_slug,
      description: i.description,
      salePrice: i.sale_price,
      costValue: i.cost_value,
      active: i.active,
    }).onConflictDoNothing({ target: items.id });
    itemCount++;
  }
  console.log(`imported ${catCount} categories, ${itemCount} items (existing rows untouched)`);
}

main().catch((e: unknown) => {
  console.error("IMPORT FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
