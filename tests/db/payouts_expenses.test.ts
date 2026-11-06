import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

// 2026-09-29: reprice from cost, recurring expenses, payouts (earned vs paid).
let t: TestDb
const u = {} as Record<'owner' | 'employee' | 'employee2', string>
const id = {} as Record<string, string>

type Summary = { person_id: string; name: string; earned: number; paid: number; owed: number; wages: number; receipts: number }
const balance = async () =>
  (await t.one<{ b: number }>(`select coalesce(sum(money_in - money_out), 0) as b from merchant.treasury_entries`)).b
const summary = (as: string) => t.as(as, () => t.rows<Summary>(`select * from merchant.payout_summary()`))

beforeAll(async () => {
  t = await createDb()
  u.owner = await t.createUser('owner', 'Owner')
  u.employee = await t.createUser('employee', 'Employee')
  u.employee2 = await t.createUser('employee', 'Employee2')
  await t.as(u.owner, async () => {
    for (const [n, price] of [['Malachite Ore', 1000], ['Coke', 5], ['Poor Charcoal', 0.5], ['Charcoal', 1], ['Charcoal Briquette', 3]] as const)
      id[n] = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ($1, $2) returning id`, [n, price])).id
    for (const [n, price] of [['Malachite Ingot', 3454], ['Glass Dagger', 4195]] as const)
      id[n] = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ($1, $2) returning id`, [n, price])).id
    const rc = `insert into merchant.recipe_components (good_id, material_id, component_good_id, quantity) values ($1, $2, $3, $4)`
    await t.db.query(rc, [id['Malachite Ingot'], id['Malachite Ore'], null, 6])
    await t.db.query(rc, [id['Malachite Ingot'], id['Coke'], null, 6])
    await t.db.query(rc, [id['Glass Dagger'], null, id['Malachite Ingot'], 1])
    await t.db.query(`select merchant.adjust_stock('good', $1, 10, 'Correction')`, [id['Glass Dagger']])
  })
})

describe('reprice', () => {
  it('sets sell price = cost × (1 + markup), rounded to 5 — managers only', async () => {
    await t.as(u.employee, async () => {
      await expect(t.db.query(`select merchant.reprice_goods($1, 0.14)`, [[id['Glass Dagger']]])).rejects.toThrow(/Not allowed/)
    })
    // Malachite Ingot = 6×1000 + 6×5 = 6030 → Glass Dagger cost 6030 → ×1.14 = 6874.2 → 6875
    const n = await t.as(u.owner, () => t.one<{ n: number }>(`select merchant.reprice_goods($1, 0.14) as n`, [[id['Glass Dagger']]]))
    expect(n.n).toBe(1)
    expect((await t.one<{ sell_price: number }>(`select sell_price from merchant.goods where id = $1`, [id['Glass Dagger']])).sell_price).toBe(6875)
  })
})

describe('payouts', () => {
  it('posting earns the payout but does not take it out of the treasury', async () => {
    const before = await balance()
    await t.as(u.employee, async () => {
      const sid = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [u.employee])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 1, 10000)`, [sid, id['Glass Dagger']])
      await t.db.query(`select merchant.post_sale($1)`, [sid])
    })
    expect(await balance()).toBeCloseTo(before + 10000)
    // payout = 10000 − 6030 − 1000 = 2970
    const [row] = await summary(u.owner)
    expect(row).toMatchObject({ person_id: u.employee, earned: 2970, paid: 0, owed: 2970, receipts: 1 })
  })

  it('recording a payment pays it out of the treasury and lowers what is owed', async () => {
    const before = await balance()
    await t.as(u.owner, () => t.db.query(`select merchant.record_payout($1, 2000, 'week 1', 'Commission')`, [u.employee]))
    await t.as(u.owner, () => t.db.query(`select merchant.record_payout($1, 150, null, 'Wages')`, [u.employee2]))
    expect(await balance()).toBeCloseTo(before - 2150)
    const rows = await summary(u.owner)
    expect(rows.find((r) => r.person_id === u.employee)).toMatchObject({ earned: 2970, paid: 2000, owed: 970 })
    expect(rows.find((r) => r.person_id === u.employee2)).toMatchObject({ earned: 0, wages: 150, owed: 0 })
  })

  it('employees only see their own line and cannot pay', async () => {
    const rows = await summary(u.employee)
    expect(rows.map((r) => r.person_id)).toEqual([u.employee])
    await t.as(u.employee, async () => {
      await expect(t.db.query(`select merchant.record_payout($1, 5)`, [u.employee])).rejects.toThrow(/Not allowed/)
    })
  })

  it('a payout can be deleted again', async () => {
    const e = await t.one<{ id: number }>(`select id from merchant.treasury_entries where ref_type = 'payout' and beneficiary_id = $1`, [u.employee])
    await t.as(u.owner, () => t.db.query(`select merchant.delete_payout($1)`, [e.id]))
    expect((await summary(u.owner)).find((r) => r.person_id === u.employee)).toMatchObject({ paid: 0, owed: 2970 })
  })
})

describe('recurring expenses', () => {
  it('a plain expense books the treasury and moves the due date one interval on', async () => {
    const before = await balance()
    const e = await t.as(u.owner, () => t.one<{ id: string }>(
      `insert into merchant.recurring_expenses (name, category, amount, interval_days, next_due) values ('Rent', 'Rent', 500, 7, '2026-09-29') returning id`))
    const paid = await t.as(u.owner, () => t.one<{ next_due: string }>(`select next_due::text from merchant.pay_recurring_expense($1)`, [e.id]))
    expect(paid.next_due).toBe('2026-10-06')
    expect(await balance()).toBeCloseTo(before - 500)
    const skipped = await t.as(u.owner, () => t.one<{ next_due: string }>(`select next_due::text from merchant.skip_recurring_expense($1)`, [e.id]))
    expect(skipped.next_due).toBe('2026-10-13')
  })

  it('a purchase-type expense (weekly charcoal) adds the stock and books 1425', async () => {
    const before = await balance()
    const lines = [
      { kind: 'material', item_id: id['Poor Charcoal'], qty: 800, unit_price: 0.5 },
      { kind: 'material', item_id: id['Charcoal'], qty: 800, unit_price: 1 },
      { kind: 'material', item_id: id['Charcoal Briquette'], qty: 75, unit_price: 3 },
    ]
    const e = await t.as(u.owner, () => t.one<{ id: string }>(
      `insert into merchant.recurring_expenses (name, purchase_lines) values ('Weekly charcoal', $1::jsonb) returning id`, [JSON.stringify(lines)]))
    await t.as(u.owner, () => t.db.query(`select merchant.pay_recurring_expense($1)`, [e.id]))
    expect(await balance()).toBeCloseTo(before - 1425)
    expect((await t.one<{ stock: number }>(`select stock from merchant.materials where name = 'Charcoal'`)).stock).toBe(800)
  })

  it('only managers can see and pay', async () => {
    await t.as(u.employee, async () => {
      expect(await t.rows(`select * from merchant.recurring_expenses`)).toHaveLength(0)
    })
  })
})
