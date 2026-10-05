import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { members } from "@/db/schema";
import { ledger } from "@/db/schema";

export interface MemberRow {
  id: string;
  name: string;
  active: boolean;
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
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.active }));
}

export async function getRoster(): Promise<string[]> {
  return (await getMembers()).filter((m) => m.active).map((m) => m.name);
}
