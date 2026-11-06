// Installs the tables on the Neon database in DATABASE_URL, or brings it up to date.
//   npm run db:setup
// Deletes nothing: a database that still holds the old books is refused, it has to be emptied
// in the Neon console first. Each merchant migration runs in its own transaction.
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query(
    `select count(*)::int as tables, count(*) filter (where table_name = 'merchant_migrations')::int as ours
     from information_schema.tables where table_schema = 'public'`,
  );
  if (rows[0].tables > 0 && rows[0].ours === 0) {
    throw new Error("This database still holds the old tables. Empty it in the Neon console first.");
  }

  await migrate(drizzle(pool), { migrationsFolder: resolve("drizzle") });
  await pool.query("create table if not exists public.merchant_migrations (name text primary key)");

  const done = await pool.query("select name from public.merchant_migrations");
  const applied = new Set(done.rows.map((r) => r.name));
  const dir = resolve("db/merchant/migrations");
  const client = await pool.connect();
  try {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (applied.has(file)) continue;
      await client.query("begin");
      try {
        await client.query(readFileSync(join(dir, file), "utf8"));
        await client.query("insert into public.merchant_migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw new Error(`${file}: ${e.message}`);
      }
      console.log(`applied ${file}`);
    }
    // The app switches to this role for every request, so make sure the connection may.
    await client.query("begin");
    await client.query("set local role merchant_app");
    await client.query("select count(*) from merchant.goods");
    await client.query("rollback");
  } finally {
    client.release();
  }
  console.log("database is up to date");
}

main()
  .catch((e) => {
    console.error("SETUP FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
