import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { members } from "@/db/schema";
import { ledger } from "@/db/schema";

export type MemberRole = "owner" | "manager" | "worker";

export interface MemberRow {
  id: string;
  name: string;
  active: boolean;
  role: MemberRole;
  discordId: string | null;
}

/** Explicit roster. Auto-seeds from ledger names once so existing books carry over. */
export async function getMembers(): Promise<MemberRow[]> {
  const db = await getDb();
  let rows = await db.select().from(members).orderBy(asc(members.name));
  if (!rows.length) {
    const ledgerRows = await db.select({ member: ledger.member }).from(ledger);
    const names = [...new Set(ledgerRows.map((r) => r.member.trim()).filter(Boolean))].sort();
    for (const name of names) {
      await db
        .insert(members)
        .values({ id: `mb-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, active: true })
        .onConflictDoNothing({ target: members.name });
    }
    rows = await db.select().from(members).orderBy(asc(members.name));
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    active: r.active,
    role: (r.role === "owner" || r.role === "manager" || r.role === "worker" ? r.role : "worker") as MemberRole,
    discordId: r.discordId,
  }));
}

export async function getRoster(): Promise<string[]> {
  return (await getMembers()).filter((m) => m.active).map((m) => m.name);
}

/** Find the roster row linked to a Discord account. Null = not linked yet. */
export async function getMemberForDiscord(discordId: string): Promise<MemberRow | null> {
  const db = await getDb();
  const rows = await db.select().from(members).where(eq(members.discordId, discordId)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    active: r.active,
    role: (r.role === "owner" || r.role === "manager" || r.role === "worker" ? r.role : "worker") as MemberRole,
    discordId: r.discordId,
  };
}

/** Can this Discord account manage money or destroy records?
 *  Linked rows enforce their role; unlinked quartermasters keep legacy
 *  access until the Owner links them (matches the action gates). */
export async function canManage(discordId?: string | null): Promise<boolean> {
  if (!discordId) return false;
  const m = await getMemberForDiscord(discordId);
  if (!m) return true;
  return m.role === "manager" || m.role === "owner";
}

/** Discord accounts seen acting in the books but not yet linked to a member row.
 *  Powers no-copy-paste linking: pick an account, pick a member, done. */
export async function getUnlinkedActors(): Promise<{ discordId: string; name: string }[]> {
  const { sales, stockMoves } = await import("@/db/schema");
  const db = await getDb();
  const [saleRows, moveRows, memberRows] = await Promise.all([
    db.select({ discordId: sales.soldByDiscordId, name: sales.soldByName }).from(sales),
    db.select({ discordId: stockMoves.actorDiscordId, name: stockMoves.actorName }).from(stockMoves),
    db.select({ discordId: members.discordId }).from(members),
  ]);
  const linked = new Set(memberRows.map((m) => m.discordId).filter(Boolean));
  const seen = new Map<string, string>();
  for (const r of [...saleRows, ...moveRows]) {
    if (!r.discordId || linked.has(r.discordId) || seen.has(r.discordId)) continue;
    if (r.name) seen.set(r.discordId, r.name);
  }
  return [...seen.entries()].map(([discordId, name]) => ({ discordId, name }));
}
