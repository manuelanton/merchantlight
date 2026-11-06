import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

let t: TestDb
let owner: string, manager: string, employee: string
const WEEK = '2026-10-05' // Mondays, long finished
const NEXT = '2026-10-12'
const LATER = '2026-10-19'

const recipe = async (name: string, stock = 100) =>
  t.as(manager, async () => {
    const mat = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ($1, 1) returning id`, [`${name} part`])).id
    await t.db.query(`select merchant.adjust_stock('material', $1, $2, 'Correction', 'x')`, [mat, stock])
    const good = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ($1, 5) returning id`, [name])).id
    await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 1)`, [good, mat])
    return { good, mat }
  })

const craft = (good: string, qty: number) => t.as(employee, () => t.one<{ id: string }>(`select id from merchant.craft($1, $2)`, [good, qty]))
const request = (good: string, qty: number) => t.as(manager, () => t.one<{ id: string }>(`select id from merchant.request_craft($1, $2)`, [good, qty]))
const state = (id: string) => t.one<{ fulfilled: number; status: string }>(`select fulfilled, status from merchant.craft_requests where id = $1`, [id])
const income = (amount: number, day: string) =>
  t.db.query(`insert into merchant.treasury_entries (entry_date, category, description, money_in) values ($1, 'Rental income', 'x', $2)`, [`${day} 10:00+00`, amount])
const ledger = (week: string) =>
  t.as(manager, () => t.rows<{ name: string; carried: number; share: number; paid: number }>(`select * from merchant.partner_ledger($1)`, [week]))
const pay = (partner: string, amount: number, day: string) =>
  t.db.query(`insert into merchant.treasury_entries (entry_date, category, description, money_out, beneficiary_id) values ($1, 'Partner payout', 'x', $2, $3)`, [`${day} 10:00+00`, amount, partner])

beforeAll(async () => {
  t = await createDb()
  await t.db.exec(`update merchant.settings set employee_profit_share = 0, profit_split_from = '-infinity'`)
  owner = await t.createUser('owner', 'Olaf')
  manager = await t.createUser('manager', 'Mira')
  employee = await t.createUser('employee', 'Erik')
})

describe('craft requests', () => {
  it('counts crafting toward the oldest open request by itself', async () => {
    const { good } = await recipe('Lantern')
    const first = await request(good, 3)
    const second = await request(good, 3)
    await craft(good, 4)
    expect(await state(first.id)).toEqual({ fulfilled: 3, status: 'done' })
    expect(await state(second.id)).toEqual({ fulfilled: 1, status: 'open' })
  })

  it('takes the progress back when the craft is deleted', async () => {
    const { good } = await recipe('Bucket')
    const asked = await request(good, 2)
    const made = await craft(good, 2)
    expect((await state(asked.id)).status).toBe('done')
    await t.as(manager, () => t.db.query(`delete from merchant.crafts where id = $1`, [made.id]))
    expect(await state(asked.id)).toEqual({ fulfilled: 0, status: 'open' })
  })

  it('lets only managers ask and cancel, everyone working here read', async () => {
    const { good } = await recipe('Shovel')
    await expect(t.as(employee, () => t.db.query(`select merchant.request_craft($1, 1)`, [good]))).rejects.toThrow(/Not allowed/)
    const asked = await request(good, 1)
    expect(await t.as(employee, () => t.rows(`select id from merchant.craft_requests where id = $1`, [asked.id]))).toHaveLength(1)
    await expect(t.as(employee, () => t.db.query(`select merchant.cancel_craft_request($1)`, [asked.id]))).rejects.toThrow(/Not allowed/)
    await t.as(manager, () => t.db.query(`select merchant.cancel_craft_request($1)`, [asked.id]))
    expect((await state(asked.id)).status).toBe('cancelled')
  })

  it('refuses items without a recipe', async () => {
    const plain = await t.as(manager, () => t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Plain', 1) returning id`))
    await expect(request(plain.id, 1)).rejects.toThrow(/recipe/)
  })
})

describe('removing items', () => {
  const remove = (user: string, kind: string, id: string) => t.as(user, () => t.db.query(`select merchant.remove_item($1, $2)`, [kind, id]))

  it('hides an item, keeps its history, frees the name and drops its requests', async () => {
    const { good } = await recipe('Old Pan')
    const asked = await request(good, 1)
    await craft(good, 1)
    const open = await request(good, 2)
    await remove(manager, 'good', good)
    expect(await t.one(`select active, on_menu from merchant.goods where id = $1`, [good])).toEqual({ active: false, on_menu: false })
    expect((await state(asked.id)).status).toBe('done')
    expect((await state(open.id)).status).toBe('cancelled')
    expect(await t.rows(`select id from merchant.crafts where good_id = $1`, [good])).toHaveLength(1)
    await t.as(manager, () => t.db.query(`insert into merchant.goods (name, sell_price) values ('Old Pan', 1)`))
  })

  it('refuses what a recipe still needs', async () => {
    const { good, mat } = await recipe('Kettle')
    await expect(remove(manager, 'material', mat)).rejects.toThrow(/still part of: Kettle/)
    await remove(manager, 'good', good)
    await remove(manager, 'material', mat)
    expect(await t.one(`select active from merchant.materials where id = $1`, [mat])).toEqual({ active: false })
  })

  it('is for managers', async () => {
    const { good } = await recipe('Ladle')
    await expect(remove(employee, 'good', good)).rejects.toThrow(/Not allowed/)
  })
})

describe('EEC commissions', () => {
  const item = async (name: string) => (await t.one<{ id: string }>(`select id from merchant.eec_items where name = $1`, [name])).id
  const order = (customer: string, id: string | null) => t.one<{ id: string; item_name: string; price: number; status: string }>(`select * from merchant.place_eec_order($1, $2)`, [customer, id])

  it('holds the whole list from the sheet', async () => {
    expect(await t.one(`select count(*)::int as n from merchant.eec_items`)).toEqual({ n: 79 })
    expect(await t.one(`select price, weekly_limit from merchant.eec_items where name = 'Nocturnal Robes'`)).toEqual({ price: 30000, weekly_limit: null })
    expect(await t.one(`select category, weekly_limit from merchant.eec_items where name = 'Linen Wraps'`)).toEqual({ category: 'Crafting Materials', weekly_limit: 10 })
  })

  it('takes a customer order without an account, at the list price', async () => {
    const placed = await order('  Lydia ', await item('Ruby'))
    expect(placed).toMatchObject({ customer: 'Lydia', item_name: 'Ruby', price: 100, status: 'open' })
  })

  it('needs a name and an item from the list', async () => {
    await expect(order(' ', await item('Ruby'))).rejects.toThrow(/your name/)
    await expect(order('Lydia', null)).rejects.toThrow(/Pick an item/)
  })

  it('moves through its statuses, for staff only', async () => {
    const placed = await order('Faendal', await item('Garnet'))
    const set = (user: string, status: string) => t.as(user, () => t.db.query(`select merchant.set_eec_order_status($1, $2)`, [placed.id, status]))
    await set(employee, 'bought')
    await set(employee, 'delivered')
    expect(await t.one(`select status from merchant.eec_orders where id = $1`, [placed.id])).toEqual({ status: 'delivered' })
    await expect(set(employee, 'lost')).rejects.toThrow(/Unknown status/)
    const visitor = await t.createUser('visitor', 'Vera')
    await expect(set(visitor, 'open')).rejects.toThrow(/Not allowed/)
    expect(await t.as(visitor, () => t.rows(`select id from merchant.eec_orders`))).toEqual([])
  })

  it('stops at the weekly limit, cancelled orders do not count', async () => {
    const wraps = await item('Linen Wraps')
    const first = await order('Staff Order', wraps)
    await t.as(employee, () => t.db.query(`select merchant.set_eec_order_status($1, 'cancelled')`, [first.id]))
    for (let i = 0; i < 10; i++) await t.as(employee, () => t.db.query(`select merchant.place_eec_order('Staff Order', $1)`, [wraps]))
    await expect(t.as(employee, () => t.db.query(`select merchant.place_eec_order('Staff Order', $1)`, [wraps]))).rejects.toThrow(/only sells 10/)
  })

  it('limits open orders per customer, not for staff', async () => {
    const pearl = await item('Pearl')
    for (let i = 0; i < 10; i++) await order('Nazeem', pearl)
    await expect(order('nazeem', pearl)).rejects.toThrow(/10 open orders/)
    await t.as(employee, () => t.db.query(`select merchant.place_eec_order('Nazeem', $1)`, [pearl]))
  })
})

describe('carrying payouts over', () => {
  const mira = (rows: Awaited<ReturnType<typeof ledger>>) => rows.find((r) => r.name === 'Mira')

  it('moves an unpaid share to the next week, closed or not', async () => {
    await income(100, WEEK)
    expect(mira(await ledger(WEEK))).toMatchObject({ carried: 0, share: 50, paid: 0 })
    expect(mira(await ledger(NEXT))).toMatchObject({ carried: 50, share: 0 })
    expect(await t.as(manager, () => t.rows(`select merchant.partner_open_weeks($1)`, [NEXT]))).toHaveLength(1)

    await t.as(manager, () => t.db.query(`select merchant.close_partner_week($1)`, [WEEK]))
    expect(mira(await ledger(NEXT))).toMatchObject({ carried: 50, share: 0 })
    expect(await t.as(manager, () => t.rows(`select merchant.partner_open_weeks($1)`, [NEXT]))).toHaveLength(0)
  })

  it('adds up over several unpaid weeks', async () => {
    await income(40, NEXT)
    expect(mira(await ledger(LATER))).toMatchObject({ carried: 70, share: 0 })
  })

  it('takes a payout off from the week after', async () => {
    await pay(manager, 30, NEXT)
    expect(mira(await ledger(NEXT))).toMatchObject({ carried: 50, share: 20, paid: 30 })
    expect(mira(await ledger(LATER))).toMatchObject({ carried: 40, paid: 0 })
  })

  it('keeps someone with gold owed who no longer shares', async () => {
    await t.as(owner, () => t.db.query(`select merchant.set_profit_share($1, false)`, [manager]))
    await t.as(manager, () => t.db.query(`select merchant.close_partner_week($1)`, [NEXT]))
    expect(mira(await ledger(LATER))).toMatchObject({ carried: 20 })
  })

  it('is for managers', async () => {
    await expect(t.as(employee, () => t.rows(`select * from merchant.partner_ledger($1)`, [WEEK]))).rejects.toThrow(/Not allowed/)
  })
})
