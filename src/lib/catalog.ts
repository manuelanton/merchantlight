import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, items } from "@/db/schema";
import { dbCatalogueEnabled } from "./flags";
import { UPCOMING_SECTIONS, getCatalogue as getSheetCatalogue } from "./sheets";
import { SEED_CATEGORIES, SEED_ITEMS } from "./seed";
import type { Category, Item } from "./types";

/** Catalogue: Postgres when flagged, otherwise the Google Sheet (production default). */
export async function getCatalogue(): Promise<{ categories: Category[]; items: Item[] }> {
  if (!dbCatalogueEnabled()) return getSheetCatalogue();
  try {
    const db = await getDb();
    const [catRows, itemRows] = await Promise.all([
      db.select().from(categories).orderBy(asc(categories.sortOrder)),
      db.select().from(items).orderBy(asc(items.name)),
    ]);
    if (!itemRows.length) return { categories: SEED_CATEGORIES, items: SEED_ITEMS };
    const cats: Category[] = catRows.map((c) => ({
      id: c.id, name: c.name, slug: c.slug, icon: c.icon, sort_order: c.sortOrder,
    }));
    for (const u of UPCOMING_SECTIONS) if (!cats.some((c) => c.slug === u.slug)) cats.push(u);
    // items whose category row is missing (shouldn't happen, but never vanish)
    for (const it of itemRows) {
      if (!cats.some((c) => c.slug === it.categorySlug)) {
        cats.push({ id: it.categorySlug, name: it.categorySlug.replace(/-/g, " "), slug: it.categorySlug, icon: "📦", sort_order: 950 });
      }
    }
    return {
      categories: cats.sort((a, b) => a.sort_order - b.sort_order),
      items: itemRows.map((i): Item => ({
        id: i.id,
        name: i.name,
        category_slug: i.categorySlug,
        description: i.description,
        sale_price: i.salePrice,
        cost_value: i.costValue,
        stock: 0,
        parent_id: i.parentId ?? null,
        low_threshold: i.lowThreshold ?? null,
        buy_price: i.buyPrice,
        max_stock: i.maxStock ?? null,
        image_url: "",
        active: i.active,
        created_by_char: i.createdByName,
        updated_by_char: "",
        updated_at: typeof i.updatedAt === "string" ? i.updatedAt : (i.updatedAt as Date).toISOString(),
      })),
    };
  } catch {
    return { categories: SEED_CATEGORIES, items: SEED_ITEMS };
  }
}

export async function getCatalogItems() {
  const { items } = await getCatalogue();
  return items.filter((i) => i.active);
}
