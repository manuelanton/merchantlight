import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

// 2026-10-18: payouts reset every Friday; a payment settles the week for that employee.
let t: TestDb
const u = {} as Record<'owner' | 'employee' | 'employee2', string>
let knife: string

type Row = { person_id: string; earned: number; paid: number; owed: number; settled: boolean; receipts: number }
const week = (wk: string, as = u.owner) => t.as(as, () => t.rows<Row>(`select * from merchant.payout_week($1::date, 'UTC')`, [wk]))
const row = async (wk: string, who: string) => (await week(wk)).find((r) => r.person_id === who)

async function sell(seller: string, at: string, price = 100) {
  await t.as(seller, async () => {
    const sid = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id, sale_date) values ($1, $2) returning id`, [seller, at])).id
    await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 1, $3)`, [sid, knife, price])
    await t.db.query(`select merchant.post_sale($1)`, [sid])
  })
}

beforeAll(async () => {
  t = await createDb()
  u.owner = await t.createUser('owner', 'Owner')
  u.employee = await t.createUser('employee', 'Employee')
  u.employee2 = await t.createUser('employee', 'Employee2')
  await t.as(u.owner, async () => {
    knife = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Knife', 100) returning id`)).id
    await t.db.query(`select merchant.adjust_stock('good', $1, 20, 'Correction')`, [knife])
  })
  // no material cost: payout = 100 − 10% = 90 each
  await sell(u.employee, '2026-10-09 00:30Z') // Friday → week of 9 Oct
  await sell(u.employee, '2026-10-15 23:30Z') // Thursday → still week of 9 Oct
  await sell(u.employee, '2026-10-16 00:10Z') // Friday → new week (16 Oct)
  await sell(u.employee2, '2026-10-12 12:00Z')
})

describe('weekly payouts', () => {
  it('weeks run Friday to Thursday', async () => {
    expect(await t.one<{ d: string }>(`select merchant._week_start('2026-10-15 23:59Z', 'UTC')::text as d`)).toEqual({ d: '2026-10-09' })
    expect(await t.one<{ d: string }>(`select merchant._week_start('2026-10-16 00:00Z', 'UTC')::text as d`)).toEqual({ d: '2026-10-16' })
    expect(await row('2026-10-09', u.employee)).toMatchObject({ earned: 180, paid: 0, owed: 180, settled: false, receipts: 2 })
    expect(await row('2026-10-16', u.employee)).toMatchObject({ earned: 90, owed: 90, receipts: 1 })
  })

  it('a payment settles the week even when the amount differs from what was earned', async () => {
    await t.as(u.owner, () => t.db.query(`select merchant.record_payout($1, 150, 'actual', 'Wages', '2026-10-09')`, [u.employee]))
    expect(await row('2026-10-09', u.employee)).toMatchObject({ earned: 180, paid: 150, owed: 0, settled: true })
    // the next week is untouched
    expect(await row('2026-10-16', u.employee)).toMatchObject({ earned: 90, paid: 0, owed: 90 })
  })

  it('a payment can be edited without changing what was earned', async () => {
    const e = await t.one<{ id: number }>(`select id from merchant.treasury_entries where ref_type = 'payout' and beneficiary_id = $1`, [u.employee])
    const v = await t.as(u.owner, () => t.one<{ money_out: number; description: string }>(
      `select money_out, description from merchant.update_payout($1, 200, 'fixed', null)`, [e.id]))
    expect(v).toMatchObject({ money_out: 200, description: 'Payout to Employee — fixed' })
    expect(await row('2026-10-09', u.employee)).toMatchObject({ earned: 180, paid: 200, owed: 0 })
    // moving it to another week un-settles the first one
    await t.as(u.owner, () => t.db.query(`select merchant.update_payout($1, 200, null, '2026-10-16')`, [e.id]))
    expect(await row('2026-10-09', u.employee)).toMatchObject({ owed: 180, settled: false })
    expect(await row('2026-10-16', u.employee)).toMatchObject({ owed: 0, settled: true })
    await t.as(u.owner, () => t.db.query(`select merchant.update_payout($1, 200, null, '2026-10-09')`, [e.id]))
  })

  it('week list totals and only Fridays are accepted', async () => {
    const weeks = await t.as(u.owner, () => t.rows<{ week: string; earned: number; paid: number; owed: number; unpaid: number }>(
      `select week::text, earned, paid, owed, unpaid from merchant.payout_weeks('UTC')`))
    expect(weeks).toEqual([
      { week: '2026-10-16', earned: 90, paid: 0, owed: 90, unpaid: 1 },
      { week: '2026-10-09', earned: 270, paid: 200, owed: 90, unpaid: 1 },
    ])
    await t.as(u.owner, async () => {
      await expect(t.db.query(`select merchant.record_payout($1, 5, null, 'Wages', '2026-10-10')`, [u.employee])).rejects.toThrow(/Friday/)
    })
  })

  it('employees only see themselves and cannot edit payments', async () => {
    expect((await week('2026-10-09', u.employee)).map((r) => r.person_id)).toEqual([u.employee])
    const e = await t.one<{ id: number }>(`select id from merchant.treasury_entries where ref_type = 'payout'`)
    await t.as(u.employee, async () => {
      await expect(t.db.query(`select merchant.update_payout($1, 1)`, [e.id])).rejects.toThrow(/Not allowed/)
    })
  })
})
