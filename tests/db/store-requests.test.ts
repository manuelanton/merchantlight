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
  const order = (user: string, customer: string, lines: { item: string; qty: number }[]) =>
    t.as(user, () => t.one<{ id: string }>(`select id from merchant.create_eec_order($1, $2::jsonb)`, [customer, JSON.stringify(lines)]))
  const paid = (user: string, id: string, on: boolean) => t.as(user, () => t.db.query(`select merchant.set_eec_paid($1, $2)`, [id, on]))
  const listed = (user: string, id: string) => t.as(user, () => t.one<{ fulfilled: boolean; paid: boolean; items: string; total: number; sale_id: string | null }>(`select * from merchant.eec_order_list() where id = $1`, [id]))

  it('holds the whole list from the sheet, at cost until prices are set', async () => {
    expect(await t.one(`select count(*)::int as n from merchant.eec_items`)).toEqual({ n: 79 })
    expect(await t.one(`select cost, price, weekly_limit from merchant.eec_items where name = 'Nocturnal Robes'`)).toEqual({ cost: 30000, price: 30000, weekly_limit: null })
    expect(await t.one(`select category, weekly_limit from merchant.eec_items where name = 'Linen Wraps'`)).toEqual({ category: 'Crafting Materials', weekly_limit: 10 })
  })

  it('takes several items with amounts, at the prices of that moment', async () => {
    const [ruby, pearl] = [await item('Ruby'), await item('Pearl')]
    await t.as(manager, () => t.db.query(`update merchant.eec_items set price = 150 where id = $1`, [ruby]))
    const placed = await order(employee, '  Lydia ', [{ item: ruby, qty: 2 }, { item: pearl, qty: 1 }])
    await t.as(manager, () => t.db.query(`update merchant.eec_items set price = 999 where id = $1`, [ruby]))
    expect(await listed(employee, placed.id)).toMatchObject({ customer: 'Lydia', items: '1× Pearl, 2× Ruby', total: 4300 })
    await t.as(manager, () => t.db.query(`update merchant.eec_items set price = cost where id = $1`, [ruby]))
  })

  it('needs a name and an item from the list', async () => {
    const ruby = await item('Ruby')
    await expect(order(employee, ' ', [{ item: ruby, qty: 1 }])).rejects.toThrow(/customer/)
    await expect(order(employee, 'Lydia', [])).rejects.toThrow(/at least one/)
    await expect(order(employee, 'Lydia', [{ item: ruby, qty: 0 }])).rejects.toThrow(/above zero/)
    await expect(order(employee, 'Lydia', [{ item: '00000000-0000-0000-0000-000000000000', qty: 1 }])).rejects.toThrow(/Pick an item/)
  })

  it('posts a receipt when paid, without touching stock, and takes it back when unticked', async () => {
    const [garnet, ruby] = [await item('Garnet'), await item('Ruby')]
    await t.as(manager, () => t.db.query(`update merchant.eec_items set price = 80 where id = $1`, [garnet]))
    const placed = await order(employee, 'Faendal', [{ item: garnet, qty: 3 }, { item: ruby, qty: 1 }])
    await t.as(manager, () => t.db.query(`update merchant.eec_items set price = cost where id = $1`, [garnet]))
    const moved = async () => (await t.one<{ n: number }>(`select count(*)::int as n from merchant.stock_movements`)).n
    const before = await moved()

    await paid(employee, placed.id, true)
    const { sale_id: sale, paid: isPaid } = await listed(employee, placed.id)
    expect(isPaid).toBe(true)
    expect(await t.one(`select status::text, customer, net_total, cost_total, seller_name from merchant.sales where id = $1`, [sale]))
      .toEqual({ status: 'posted', customer: 'Faendal', net_total: 340, cost_total: 280, seller_name: 'Erik' })
    expect(await t.rows(`select good_name, category, quantity from merchant.sale_lines where sale_id = $1 order by good_name`, [sale]))
      .toEqual([{ good_name: 'Garnet', category: 'Gems', quantity: 3 }, { good_name: 'Ruby', category: 'Gems', quantity: 1 }])
    expect(await t.one(`select money_in from merchant.treasury_entries where category = 'Sales income' and ref_id = $1`, [sale])).toEqual({ money_in: 340 })
    expect(await moved()).toBe(before)

    await paid(employee, placed.id, true) // ticking twice changes nothing
    expect(await t.one(`select count(*)::int as n from merchant.sales where id = $1`, [sale])).toEqual({ n: 1 })

    await paid(manager, placed.id, false)
    expect(await listed(employee, placed.id)).toMatchObject({ paid: false, sale_id: null })
    expect(await t.one(`select coalesce(sum(money_in - money_out), 0) as net from merchant.treasury_entries where ref_id = $1`, [sale])).toEqual({ net: 0 })
  })

  it('shows an order as paid to staff who cannot see the receipt, and unpaid while it is reopened', async () => {
    const placed = await order(manager, 'Hulda', [{ item: await item('Ruby'), qty: 1 }])
    await paid(manager, placed.id, true)
    expect((await listed(employee, placed.id)).paid).toBe(true)
    const { sale_id: sale } = await listed(manager, placed.id)
    await t.as(manager, () => t.db.query(`select merchant.unpost_sale($1)`, [sale]))
    expect((await listed(employee, placed.id)).paid).toBe(false)
    await paid(manager, placed.id, true)
    expect(await listed(employee, placed.id)).toMatchObject({ paid: true, sale_id: sale })
  })

  it('ticks fulfilled apart from paid', async () => {
    const placed = await order(employee, 'Ysolda', [{ item: await item('Ruby'), qty: 1 }])
    await t.as(employee, () => t.db.query(`select merchant.set_eec_fulfilled($1, true)`, [placed.id]))
    expect(await listed(employee, placed.id)).toMatchObject({ fulfilled: true, paid: false })
    await t.as(employee, () => t.db.query(`select merchant.set_eec_fulfilled($1, false)`, [placed.id]))
    expect((await listed(employee, placed.id)).fulfilled).toBe(false)
  })

  it('cancels only what is not paid, and a cancelled order takes no ticks', async () => {
    const placed = await order(employee, 'Brenuin', [{ item: await item('Ruby'), qty: 1 }])
    const cancel = (on: boolean) => t.as(employee, () => t.db.query(`select merchant.set_eec_cancelled($1, $2)`, [placed.id, on]))
    await paid(employee, placed.id, true)
    await expect(cancel(true)).rejects.toThrow(/untick Paid/)
    await paid(employee, placed.id, false)
    await cancel(true)
    await expect(paid(employee, placed.id, true)).rejects.toThrow(/cancelled/)
    await cancel(false)
    await paid(employee, placed.id, true)
  })

  it('counts amounts against the weekly limit, cancelled orders do not', async () => {
    const wraps = await item('Linen Wraps')
    const first = await order(employee, 'Sigrid', [{ item: wraps, qty: 8 }])
    await expect(order(employee, 'Sigrid', [{ item: wraps, qty: 3 }])).rejects.toThrow(/only sells 10/)
    await t.as(employee, () => t.db.query(`select merchant.set_eec_cancelled($1, true)`, [first.id]))
    await order(employee, 'Sigrid', [{ item: wraps, qty: 10 }])
  })

  it('keeps it to staff, prices to managers', async () => {
    const visitor = await t.createUser('visitor', 'Vera')
    await expect(order(visitor, 'Vera', [{ item: await item('Ruby'), qty: 1 }])).rejects.toThrow(/Not allowed/)
    await expect(t.as(visitor, () => t.rows(`select * from merchant.eec_order_list()`))).rejects.toThrow(/Not allowed/)
    expect(await t.as(visitor, () => t.rows(`select id from merchant.eec_orders`))).toEqual([])
    await t.as(employee, () => t.db.query(`update merchant.eec_items set price = 1`))
    expect(await t.one(`select count(*)::int as n from merchant.eec_items where price = 1`)).toEqual({ n: 0 })
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
