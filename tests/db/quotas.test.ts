import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

// 2026-11-02: profit split 37.5 % employee / 62.5 % merchant; quota pay for novice/advanced employees.
let t: TestDb
const u = {} as Record<'owner' | 'novice' | 'advanced' | 'employee', string>
const id = {} as Record<string, string>

type QRow = { person_id: string; good_id: string; crafted: number; paid_qty: number; earned: number; weekly_target: number | null; rank: string }
const quota = (as: string) => t.as(as, () => t.rows<QRow>(`select * from merchant.quota_week(merchant._week_start(now(), 'UTC'), 'UTC')`))
type PRow = { person_id: string; earned: number; sales_earned: number; quota_earned: number; owed: number }
const payouts = () => t.as(u.owner, () => t.rows<PRow>(`select * from merchant.payout_week(merchant._week_start(now(), 'UTC'), 'UTC')`))

beforeAll(async () => {
  t = await createDb()
  u.owner = await t.createUser('owner', 'Owner')
  u.novice = await t.createUser('employee', 'Novice')
  u.advanced = await t.createUser('employee', 'Advanced')
  u.employee = await t.createUser('employee', 'Plain')
  await t.db.query(`update merchant.profiles set rank = 'novice' where id = $1`, [u.novice])
  await t.db.query(`update merchant.profiles set rank = 'advanced' where id = $1`, [u.advanced])
  await t.as(u.owner, async () => {
    id.ore = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ('Iron Ore', 10) returning id`)).id
    id.ingot = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Iron Ingot', 30) returning id`)).id
    id.sword = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Iron Sword', 120) returning id`)).id
    await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 2)`, [id.ingot, id.ore])
    await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 10)`, [id.sword, id.ore])
    await t.db.query(`select merchant.adjust_stock('material', $1, 1000, 'Correction')`, [id.ore])
  })
})

describe('profit split', () => {
  it('cost 100, sold for 120 → employee 7.5, merchant 12.5 (new receipts only)', async () => {
    const sale = async () => t.as(u.employee, async () => {
      const sid = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [u.employee])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 1, 120)`, [sid, id.sword])
      return sid
    })
    const old = await sale()
    await t.db.query(`update merchant.settings set profit_split_from = now() + interval '1 millisecond'`)
    await new Promise((r) => setTimeout(r, 5))
    const fresh = await sale()
    const preview = await t.as(u.employee, () => t.one<{ p: { commission_amount: number; merchant_keep: number; employee_share: number } }>(
      `select merchant.sale_post_preview($1) as p`, [fresh]))
    expect(preview.p).toMatchObject({ commission_amount: 7.5, merchant_keep: 12.5, employee_share: 0.375 })
    const posted = await t.as(u.employee, () => t.one<{ commission_amount: number; employee_share: number }>(`select * from merchant.post_sale($1)`, [fresh]))
    expect(posted).toMatchObject({ commission_amount: 7.5, employee_share: 0.375 })
    // the older draft keeps the old rule: 120 − 100 − 12 = 8
    const before = await t.as(u.employee, () => t.one<{ commission_amount: number; employee_share: number | null }>(`select * from merchant.post_sale($1)`, [old]))
    expect(before).toMatchObject({ commission_amount: 8, employee_share: null })
  })
})

describe('quotas', () => {
  it('only managers set quota items', async () => {
    await t.as(u.employee, async () => {
      await expect(t.db.query(`insert into merchant.quota_items (good_id, rate) values ($1, 2)`, [id.ingot])).rejects.toThrow()
    })
    await t.as(u.owner, () => t.db.query(`insert into merchant.quota_items (good_id, rate, weekly_target) values ($1, 2, 50)`, [id.ingot]))
  })

  it('counts crafts of novice/advanced employees × rate and adds them to the weekly payout', async () => {
    await t.as(u.novice, () => t.db.query(`select merchant.craft($1, 10)`, [id.ingot]))
    await t.as(u.novice, () => t.db.query(`select merchant.craft($1, 5)`, [id.ingot]))
    await t.as(u.advanced, () => t.db.query(`select merchant.craft($1, 3)`, [id.ingot]))
    await t.as(u.employee, () => t.db.query(`select merchant.craft($1, 4)`, [id.ingot])) // no rank → no quota

    const rows = await quota(u.owner)
    expect(rows.map((r) => [r.person_id, r.crafted, r.earned, r.weekly_target])).toEqual(expect.arrayContaining([
      [u.novice, 15, 30, 50], [u.advanced, 3, 6, 50],
    ]))
    expect(rows.find((r) => r.person_id === u.employee)).toBeUndefined()
    expect((await quota(u.novice)).map((r) => r.person_id)).toEqual([u.novice])

    const p = await payouts()
    expect(p.find((r) => r.person_id === u.novice)).toMatchObject({ quota_earned: 30, sales_earned: 0, earned: 30, owed: 30 })
    // the plain employee sold a sword this week: sales only
    expect(p.find((r) => r.person_id === u.employee)).toMatchObject({ quota_earned: 0, sales_earned: 15.5 })
  })

  it('changing the rate changes the pay; only the owner sets ranks', async () => {
    await t.as(u.owner, () => t.db.query(`update merchant.quota_items set rate = 3 where good_id = $1`, [id.ingot]))
    expect((await quota(u.owner)).find((r) => r.person_id === u.novice)).toMatchObject({ earned: 45 })
    await t.as(u.employee, async () => {
      await expect(t.db.query(`select merchant.set_rank($1, 'advanced')`, [u.employee])).rejects.toThrow(/Not allowed/)
    })
    await t.as(u.owner, () => t.db.query(`select merchant.set_rank($1, 'novice')`, [u.employee]))
    expect((await quota(u.owner)).find((r) => r.person_id === u.employee)).toMatchObject({ crafted: 4, earned: 12 })
  })
  it('pay stops at the weekly target', async () => {
    // novice has 15 at rate 3; target 50 → craft 100 more = 115 crafted, only 50 paid
    await t.as(u.novice, () => t.db.query(`select merchant.craft($1, 100)`, [id.ingot]))
    const r = (await quota(u.owner)).find((x) => x.person_id === u.novice)
    expect(r).toMatchObject({ crafted: 115, paid_qty: 50, earned: 150 })
    expect((await payouts()).find((x) => x.person_id === u.novice)).toMatchObject({ quota_earned: 150 })
    // no target → every piece is paid
    await t.as(u.owner, () => t.db.query(`update merchant.quota_items set weekly_target = null where good_id = $1`, [id.ingot]))
    expect((await quota(u.owner)).find((x) => x.person_id === u.novice)).toMatchObject({ paid_qty: 115, earned: 345 })
  })
})
