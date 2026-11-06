import { asService } from "@/lib/merchant-db";
import { UPCOMING_SECTIONS, getCatalogue as getSheetCatalogue } from "./sheets";
import { ItemSchema, type Category, type Item } from "./types";

const slugOf = (name: string) => name.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Public catalogue: whatever is switched on the menu in the backoffice. The Sheet only steps in when that is empty or down. */
export async function getCatalogue(): Promise<{ categories: Category[]; items: Item[] }> {
  try {
    const [rows, known] = await Promise.all([
      asService<{ id: string; name: string; category: string; price: number }>(
        `select id::text, name, category, sell_price as price from merchant.goods where active and on_menu
         union all
         select id::text, name, 'Materials', coalesce(sell_price, buy_price) from merchant.materials where active and on_menu
         order by name`,
      ),
      asService<Category>(`select id, name, slug, icon, sort_order from public.categories`),
    ]);
    if (!rows.length) return getSheetCatalogue();

    const categories = [...known];
    for (const u of UPCOMING_SECTIONS) if (!categories.some((c) => c.slug === u.slug)) categories.push(u);
    const items = rows.map((r) => {
      let category = categories.find((c) => c.name === r.category);
      if (!category) {
        category = { id: slugOf(r.category), name: r.category, slug: slugOf(r.category), icon: "", sort_order: 99 };
        categories.push(category);
      }
      return ItemSchema.parse({ id: r.id, name: r.name, category_slug: category.slug, sale_price: r.price });
    });
    return { categories: categories.sort((a, b) => a.sort_order - b.sort_order), items };
  } catch (e) {
    console.error("Catalogue falls back to the Sheet:", e);
    return getSheetCatalogue();
  }
}
