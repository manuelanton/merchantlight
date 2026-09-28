import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";

const KEY = "shop_open";

/** Is there a salesperson on duty? Defaults to closed — no false promises. */
export async function isShopOpen(): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
    return rows[0]?.value === "1";
  } catch {
    return false;
  }
}

export async function setShopOpen(open: boolean, db?: Awaited<ReturnType<typeof getDb>>) {
  const d = db || (await getDb());
  const rows = await d.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (rows.length) {
    await d.update(settings).set({ value: open ? "1" : "0", updatedAt: new Date() }).where(eq(settings.key, KEY));
  } else {
    await d.insert(settings).values({ key: KEY, value: open ? "1" : "0" });
  }
}
