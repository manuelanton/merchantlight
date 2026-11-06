// Runs the real migrations on an in-process Postgres (PGlite), so RLS and RPCs
// can be tested without a database server.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = fileURLToPath(new URL('../../db/merchant/migrations', import.meta.url))

// Stand-ins for the old Merchantlight tables: must survive the migrations untouched.
const LEGACY_STUB = `
create table public.stock_movements (id int primary key);
create function public.is_manager() returns boolean language sql as $$ select true $$;
`

export type Role = 'owner' | 'manager' | 'employee' | 'supplier' | 'visitor'

export async function createDb() {
  const db = new PGlite()
  await db.exec(LEGACY_STUB)
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }
  // The tests ported from the Forge run with its commission on; store.test.ts turns it off again.
  await db.exec(`update merchant.settings set profit_split_from = 'infinity', employee_profit_share = 0.375`)

  async function createUser(role: Role, name: string = role) {
    const res = await db.query<{ id: string }>(
      `insert into merchant.profiles (discord_id, username, display_name, discord_role, in_guild)
       values ($1, $2, $2, $3, true) returning id`,
      [`d-${name}-${Math.random()}`, name, role],
    )
    return res.rows[0].id
  }

  /** Run `fn` as a signed-in user (RLS + grants apply). */
  async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role merchant_app`)
    await db.query(`select set_config('merchant.user_id', $1, false)`, [userId])
    try {
      return await fn()
    } finally {
      await db.exec(`reset role; select set_config('merchant.user_id', '', false);`)
    }
  }

  async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await db.query<T>(sql, params)).rows
  }

  async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const r = await rows<T>(sql, params)
    return r[0]
  }

  return { db, createUser, as, rows, one }
}

export type TestDb = Awaited<ReturnType<typeof createDb>>
