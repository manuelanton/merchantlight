import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

const MIGRATIONS = fileURLToPath(new URL('../../db/merchant/migrations', import.meta.url))

const UPSERT = `select * from merchant.upsert_discord_profile($1, 'name', 'Display', null, $2, true)`

describe('without a superuser (like the Neon owner role)', () => {
  it('applies every migration and can drop into merchant_app', async () => {
    const db = new PGlite()
    await db.exec(`
      create role app_owner login createrole;
      grant create on database postgres to app_owner;
      set role app_owner;
    `)
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
    }
    const res = await db.query<{ id: string }>(UPSERT, ['d-1', 'owner'])
    await db.exec(`begin; set local role merchant_app;`)
    await db.query(`select set_config('merchant.user_id', $1, true)`, [res.rows[0].id])
    const me = await db.query<{ role: string }>(`select merchant.my_role() as role`)
    await db.exec(`commit;`)
    expect(me.rows[0].role).toBe('owner')
  })
})

describe('discord profiles', () => {
  let t: TestDb
  beforeAll(async () => { t = await createDb() })

  it('keeps the profile id across logins and follows the Discord role', async () => {
    const first = await t.one<{ id: string; role: string }>(UPSERT, ['d-2', 'manager'])
    const second = await t.one<{ id: string; role: string }>(UPSERT, ['d-2', 'employee'])
    expect(second.id).toBe(first.id)
    expect(second.role).toBe('employee')
  })

  it('leaves a role override in place', async () => {
    const p = await t.one<{ id: string }>(UPSERT, ['d-3', 'employee'])
    await t.db.query(`update merchant.profiles set role_override = 'manager' where id = $1`, [p.id])
    expect((await t.one<{ role: string }>(UPSERT, ['d-3', 'visitor'])).role).toBe('manager')
  })

  it('cannot be called by a signed-in user to raise their own role', async () => {
    const visitor = await t.createUser('visitor', 'Sneaky')
    await expect(t.as(visitor, () => t.db.query(UPSERT, ['d-4', 'owner']))).rejects.toThrow(/permission denied/)
  })

  it('treats a request without a user as a visitor who sees no books', async () => {
    await t.db.exec(`set role merchant_app`)
    try {
      expect((await t.one<{ role: string }>(`select merchant.my_role() as role`)).role).toBe('visitor')
      expect(await t.rows(`select id from merchant.sales`)).toHaveLength(0)
      await expect(t.db.query(`insert into merchant.goods (name) values ('Nope')`)).rejects.toThrow()
    } finally {
      await t.db.exec(`reset role`)
    }
  })
})
