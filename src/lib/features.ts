import { eq, like } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { SHOP } from "@/shop/config";

/**
 * Runtime feature flags for the superadmin playground.
 *
 * SHOP.features in shop/config.ts holds the defaults (code). Any flag
 * listed in RUNTIME_FEATURES can be overridden at runtime from
 * /admin/super — overrides live in the settings table as
 * `feature:<key>` = "1"/"0" and win over the code default.
 * No redeploy needed to flip them; flip back to "code default" to clear.
 */

export const RUNTIME_FEATURES = [
  { key: "stock", label: "Stock tracking", desc: "Stock tab, counts, low-stock box, and posting stock moves. Off = catalogue + sales + gold only." },
  { key: "storage", label: "Storage admin tab", desc: "Show the Storage section in the backoffice nav." },
  { key: "storagePublic", label: "Public storage teaser", desc: "Storage card + visit-us note on the public homepage." },
  { key: "upcomingTeasers", label: "Upcoming-section teasers", desc: "Cards for empty upcoming sections (e.g. Enchantments)." },
  { key: "notes", label: "Board tab", desc: "Show the noticeboard in the backoffice nav." },
  { key: "guide", label: "Guide tab", desc: "Show the quartermaster guide in the backoffice nav." },
] as const;

export type RuntimeFeatureKey = (typeof RUNTIME_FEATURES)[number]["key"];

const rowKey = (key: string) => `feature:${key}`;

function codeDefault(key: RuntimeFeatureKey): boolean {
  return SHOP.features[key] ?? true;
}

/** Effective value: DB override wins, otherwise the code default. Server-only. */
export async function isFeatureOn(key: RuntimeFeatureKey): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = await db.select().from(settings).where(eq(settings.key, rowKey(key))).limit(1);
    if (!rows.length) return codeDefault(key);
    return rows[0].value === "1";
  } catch {
    return codeDefault(key);
  }
}

/** For the superadmin page: effective value + whether an override exists. */
export async function getFeatureStates(): Promise<{ key: RuntimeFeatureKey; label: string; desc: string; on: boolean; overridden: boolean }[]> {
  const db = await getDb();
  const rows = await db.select().from(settings).where(like(settings.key, "feature:%"));
  const overrides = new Map(rows.map((r) => [r.key, r.value === "1"]));
  return RUNTIME_FEATURES.map((f) => ({
    ...f,
    overridden: overrides.has(rowKey(f.key)),
    on: overrides.has(rowKey(f.key)) ? overrides.get(rowKey(f.key))! : codeDefault(f.key),
  }));
}

/** Superadmin gate: SUPERADMIN_DISCORD_ID env wins; falls back to WildCard
 *  so no env wrangling is needed. Empty/mismatch = 404 everywhere. */
const FALLBACK_SUPERADMIN = "146826443924439040"; // WildCard
export function isSuperAdmin(discordId?: string | null): boolean {
  const admin = (process.env.SUPERADMIN_DISCORD_ID || "").trim() || FALLBACK_SUPERADMIN;
  return !!admin && !!discordId && discordId === admin;
}
