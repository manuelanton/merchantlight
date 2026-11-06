import { neon } from "@neondatabase/serverless";
import { getPglite } from "@/db";

// Raw SQL against the `merchant` schema: Neon in production, PGlite locally.

/** Server-only work on the owner connection: RLS does not apply. Never pass user-chosen SQL. */
export async function asService<T>(text: string, params: unknown[] = []): Promise<T[]> {
  if (process.env.DATABASE_URL) {
    return (await neon(process.env.DATABASE_URL).query(text, params)) as T[];
  }
  return (await (await getPglite()).query<T>(text, params)).rows;
}

/** Run as the signed-in user: role and user id last for one transaction, RLS and grants apply. */
export async function asUser<T>(profileId: string, text: string, params: unknown[] = []): Promise<T[]> {
  const setUser = "select set_config('merchant.user_id', $1, true)";
  if (process.env.DATABASE_URL) {
    const sql = neon(process.env.DATABASE_URL);
    const results = await sql.transaction([
      sql.query("set local role merchant_app"),
      sql.query(setUser, [profileId]),
      sql.query(text, params),
    ]);
    return results[2] as T[];
  }
  const db = await getPglite();
  return db.transaction(async (tx) => {
    await tx.query("set local role merchant_app");
    await tx.query(setUser, [profileId]);
    return (await tx.query<T>(text, params)).rows;
  });
}
