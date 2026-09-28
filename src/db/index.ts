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

let db: Db | null = null;
let migrated = false;

async function ensureMigrated(client: ReturnType<typeof drizzlePglite<typeof schema>>, raw: PGlite) {
  if (migrated) return;
  migrated = true;
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

export async function getDb(): Promise<Db> {
  if (db) return db;
  if (process.env.DATABASE_URL) {
    const sql = neon(process.env.DATABASE_URL);
    db = drizzlePg(sql, { schema });
    return db;
  }
  const dataDir = resolve(process.cwd(), ".data/books");
  mkdirSync(dirname(dataDir), { recursive: true }); // PGlite won't create parents itself
  const raw = new PGlite(dataDir);
  const client = drizzlePglite(raw, { schema });
  await ensureMigrated(client, raw);
  db = client;
  return db;
}
