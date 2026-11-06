import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

// Orders don't reserve stock (owner decision 2026-09-26): they only show what they need
// from the current stock and warn when it isn't enough.
let t: TestDb
const u = {} as Record<'manager' | 'employee' | 'employee2', string>
const id = {} as Record<string, string>

type Overview = {
  short: boolean
  all_crafted: boolean
  reservations: { name: string; qty: number; missing: number }[]
  lines: { good_name: string; ready_qty: number }[]
}

const stock = async (table: 'materials' | 'goods', name: string) =>
  (await t.one<{ stock: number }>(`select stock from merchant.${table} where name = $1`, [name])).stock
const overview = (orderId: string) =>
  t.as(u.employee, () => t.one<{ o: Overview }>(`select merchant.order_overview($1) as o`, [orderId])).then((r) => r.o)
const needs = async (orderId: string) =>
  Object.fromEntries((await overview(orderId)).reservations.map((r) => [r.name, r.qty]))

beforeAll(async () => {
  t = await createDb()
  u.manager = await t.createUser('manager', 'Manager')
  u.employee = await t.createUser('employee', 'Employee')
  u.employee2 = await t.createUser('employee', 'Employee2')
  await t.as(u.manager, async () => {
    for (const [name, price] of [['Iron Ore', 0.5], ['Coal', 0.5], ['Leather Strips', 1]] as const)
      id[name] = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ($1, $2) returning id`, [name, price])).id
    for (const [name, price] of [['Iron Ingot', 7], ['Iron Sword', 20]] as const)
      id[name] = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ($1, $2) returning id`, [name, price])).id
    const rc = `insert into merchant.recipe_components (good_id, material_id, component_good_id, quantity) values ($1, $2, $3, $4)`
    await t.db.query(rc, [id['Iron Ingot'], id['Iron Ore'], null, 2])
    await t.db.query(rc, [id['Iron Ingot'], id['Coal'], null, 2])
    await t.db.query(rc, [id['Iron Sword'], null, id['Iron Ingot'], 2])
    await t.db.query(rc, [id['Iron Sword'], id['Leather Strips'], null, 1])
    await t.db.query(`select merchant.adjust_stock('material', $1, 20, 'Correction')`, [id['Iron Ore']])
    await t.db.query(`select merchant.adjust_stock('material', $1, 20, 'Correction')`, [id['Coal']])
    await t.db.query(`select merchant.adjust_stock('material', $1, 5, 'Correction')`, [id['Leather Strips']])
  })
})

describe('orders', () => {
  let order: string

  it('an order shows what it needs but reserves nothing', async () => {
    order = (await t.as(u.employee, () => t.one<{ id: string }>(
      `select * from merchant.create_order('Bob', $1::jsonb)`, [JSON.stringify([{ good_id: id['Iron Sword'], qty: 2 }])]))).id
    // 2 swords → 4 ingots (none in stock → their materials) + 2 strips
    expect(await needs(order)).toEqual({ 'Iron Ore': 8, Coal: 8, 'Leather Strips': 2 })
    expect((await overview(order)).short).toBe(false)
    expect((await t.one<{ n: number }>(`select count(*)::int as n from merchant.order_reservations`)).n).toBe(0)
    const line = await t.one<{ unit_price: number }>(`select unit_price from merchant.order_lines where order_id = $1`, [order])
    expect(line.unit_price).toBe(20) // defaults to the sell price
  })

  it('stock stays fully usable for other work', async () => {
    const cap = await t.as(u.employee2, () => t.rows<{ good_id: string; max_qty: number }>(`select * from merchant.craft_capacity()`))
    expect(cap.find((c) => c.good_id === id['Iron Ingot'])?.max_qty).toBe(10) // all 20 ore
  })

  it('warns when the current stock is not enough', async () => {
    const o2 = (await t.as(u.employee2, () => t.one<{ id: string }>(
      `select * from merchant.create_order('Eve', $1::jsonb)`, [JSON.stringify([{ good_id: id['Iron Sword'], qty: 6 }])]))).id
    const ov = await overview(o2)
    expect(ov.short).toBe(true)
    expect(ov.reservations.find((r) => r.name === 'Leather Strips')?.missing).toBe(1) // needs 6, stock 5
    await t.as(u.employee2, () => t.db.query(`select merchant.cancel_order($1)`, [o2]))
  })

  it('crafted goods count as ready for the order', async () => {
    await t.as(u.employee, () => t.db.query(`select merchant.craft($1, 4, null, $2)`, [id['Iron Ingot'], order]))
    expect(await needs(order)).toEqual({ 'Iron Ingot': 4, 'Leather Strips': 2 })
    await t.as(u.employee, () => t.db.query(`select merchant.craft($1, 2, null, $2)`, [id['Iron Sword'], order]))
    const ov = await overview(order)
    expect(ov.all_crafted).toBe(true)
    expect(ov.lines[0].ready_qty).toBe(2)
    const c = await t.one<{ order_id: string }>(`select order_id from merchant.crafts order by created_at desc limit 1`)
    expect(c.order_id).toBe(order)
  })

  it('only the creator or a manager may change or cancel an order', async () => {
    await t.as(u.employee2, async () => {
      await expect(t.db.query(`select merchant.cancel_order($1)`, [order])).rejects.toThrow(/Not allowed/)
      expect((await t.db.query(`update merchant.orders set customer = 'X' where id = $1`, [order])).affectedRows).toBe(0)
    })
  })

  it('employees cannot deliver in someone else\'s name', async () => {
    await t.as(u.employee, async () => {
      await expect(t.db.query(`select merchant.deliver_order($1, $2)`, [order, u.employee2])).rejects.toThrow(/Not allowed/)
    })
  })

  it('delivering posts the receipt; deleting the receipt reopens the order', async () => {
    const s = await t.as(u.employee, () => t.one<{ id: string; status: string; net_total: number; customer: string }>(
      `select * from merchant.deliver_order($1)`, [order]))
    expect(s).toMatchObject({ status: 'posted', net_total: 40, customer: 'Bob' })
    expect(await stock('goods', 'Iron Sword')).toBe(0)
    expect(await t.one(`select status, sale_id from merchant.orders where id = $1`, [order])).toEqual({ status: 'delivered', sale_id: s.id })

    await t.as(u.manager, () => t.db.query(`delete from merchant.sales where id = $1`, [s.id]))
    expect((await t.one<{ status: string }>(`select status from merchant.orders where id = $1`, [order])).status).toBe('open')
    expect(await stock('goods', 'Iron Sword')).toBe(2)
  })
})
