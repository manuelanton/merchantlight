import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzlePg } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

// Books DB. Production: Neon Postgres via DATABASE_URL (Vercel Storage tab).
// Local/dev branch: embedded PGlite file DB, zero setup, auto-migrated.
type Db = ReturnType<typeof drizzlePglite<typeof schema>> | ReturnType<typeof drizzlePg<typeof schema>>;

let db: Promise<Db> | null = null;
let pglite: PGlite | null = null;

async function ensureMigrated(client: ReturnType<typeof drizzlePglite<typeof schema>>, raw: PGlite) {
  // NB: drizzle's pglite migrator breaks under Next bundling (URL/fs realm issue),
  // so apply the generated SQL directly. Prod (Neon) uses `drizzle-kit migrate`.
  const probe = await raw.query("select to_regclass('public.sales') as t");
  if ((probe.rows[0] as { t: string | null }).t) return;
  const dir = resolve(process.cwd(), "drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await raw.exec(readFileSync(join(dir, f), "utf8"));
  }
}

/** Local dev only: applies the `merchant` migrations this DB hasn't seen yet, each in one transaction. */
async function ensureMerchantSchema(raw: PGlite) {
  await raw.exec("create table if not exists public.merchant_migrations (name text primary key)");
  const rows = await raw.query<{ name: string }>("select name from public.merchant_migrations");
  const applied = new Set(rows.rows.map((r) => r.name));
  const dir = resolve(process.cwd(), "db/merchant/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(f)) continue;
    await raw.transaction(async (tx) => {
      await tx.exec(readFileSync(join(dir, f), "utf8"));
      await tx.query("insert into public.merchant_migrations (name) values ($1)", [f]);
    });
  }
}

/** One shared promise: parallel first requests must not open the data dir twice. */
export function getDb(): Promise<Db> {
  db ??= openDb();
  return db;
}

async function openDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const sql = neon(process.env.DATABASE_URL);
    return drizzlePg(sql, { schema });
  }
  const dataDir = resolve(process.cwd(), ".data/books");
  mkdirSync(dirname(dataDir), { recursive: true }); // PGlite won't create parents itself
  const raw = new PGlite(dataDir);
  const client = drizzlePglite(raw, { schema });
  await ensureMigrated(client, raw);
  await ensureMerchantSchema(raw);
  pglite = raw;
  return client;
}

/** The embedded DB for raw SQL. Only valid without DATABASE_URL. */
export async function getPglite(): Promise<PGlite> {
  await getDb();
  if (!pglite) throw new Error("No embedded database: DATABASE_URL is set");
  return pglite;
}
