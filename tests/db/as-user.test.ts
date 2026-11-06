import { beforeAll, describe, expect, it, vi } from 'vitest'
import { asService, asUser } from '@/lib/merchant-db'
import { createDb, type TestDb } from './harness'

let t: TestDb

vi.mock('@/db', () => ({ getPglite: async () => t.db }))

beforeAll(async () => { t = await createDb() })

const whoAmI = `select current_user::text as db_role, merchant.my_role()::text as role`

describe('asUser', () => {
  it('runs as merchant_app with the caller’s role', async () => {
    const manager = await t.createUser('manager', 'Real Manager')
    expect(await asUser(manager, whoAmI)).toEqual([{ db_role: 'merchant_app', role: 'manager' }])
  })

  it('leaves no role or user behind for the next request', async () => {
    const owner = await t.createUser('owner', 'Real Owner')
    await asUser(owner, whoAmI)
    expect(await asService<{ db_role: string; uid: string | null }>(`select current_user::text as db_role, merchant_auth.uid() as uid`))
      .toEqual([{ db_role: 'postgres', uid: null }])
  })

  it('leaves nothing behind after a failed call', async () => {
    const employee = await t.createUser('employee', 'Real Employee')
    await expect(asUser(employee, `select merchant.create_purchase('[]'::jsonb)`)).rejects.toThrow(/Not allowed/)
    expect(await asService(`select current_user::text as db_role`)).toEqual([{ db_role: 'postgres' }])
  })

  it('keeps one user’s rows away from another', async () => {
    const [a, b] = [await t.createUser('employee', 'Seller A'), await t.createUser('employee', 'Seller B')]
    await asUser(a, `insert into merchant.sales (seller_id) values ($1)`, [a])
    expect(await asUser(a, `select id from merchant.sales`)).toHaveLength(1)
    expect(await asUser(b, `select id from merchant.sales`)).toHaveLength(0)
  })
})
