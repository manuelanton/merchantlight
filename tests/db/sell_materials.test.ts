import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

// Employees can sell raw materials (ores…) on receipts (2026-09-26).
let t: TestDb
let employee: string
let manager: string
let ore: string
let sword: string

const oreStock = async () => (await t.one<{ stock: number }>(`select stock from merchant.materials where id = $1`, [ore])).stock

beforeAll(async () => {
  t = await createDb()
  manager = await t.createUser('manager', 'Manager')
  employee = await t.createUser('employee', 'Employee')
  await t.as(manager, async () => {
    ore = (await t.one<{ id: string }>(
      `insert into merchant.materials (name, category, buy_price, sell_price) values ('Iron Ore', 'Ore', 0.5, 1) returning id`)).id
    sword = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Sword', 20) returning id`)).id
    await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 4)`, [sword, ore])
    await t.db.query(`select merchant.adjust_stock('material', $1, 100, 'Correction')`, [ore])
  })
})

describe('selling raw materials', () => {
  let sid: string

  it('a receipt can mix goods and ores', async () => {
    sid = await t.as(employee, async () => {
      const sid = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [employee])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, material_id, quantity, unit_price) values ($1, $2, 50, 1)`, [sid, ore])
      await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 1, 20)`, [sid, sword])
      return sid
    })
    const line = await t.one<{ good_name: string; category: string }>(`select good_name, category from merchant.sale_lines where material_id = $1`, [ore])
    expect(line).toEqual({ good_name: 'Iron Ore', category: 'Ore' })
  })

  it('posting deducts the ore, costs it at buy price and pays the employee', async () => {
    const s = await t.as(employee, () => t.one<{ net_total: number; cost_total: number; commission_amount: number }>(
      `select * from merchant.post_sale($1)`, [sid]))
    // 50 ore sold; the sword comes off its own stock, nothing is crafted
    expect(await oreStock()).toBe(50)
    expect((await t.one<{ stock: number }>(`select stock from merchant.goods where id = $1`, [sword])).stock).toBe(-1)
    // revenue 70; cost 50×0.5 + 4×0.5 = 27; keep 7 → payout 36
    expect(s).toMatchObject({ net_total: 70, cost_total: 27, commission_amount: 36 })
  })

  it('deleting the receipt puts the ore back', async () => {
    await t.as(manager, () => t.db.query(`delete from merchant.sales where id = $1`, [sid]))
    expect(await oreStock()).toBe(100)
  })

  it('selling more ore than in stock goes negative', async () => {
    await t.as(employee, async () => {
      const id = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [employee])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, material_id, quantity, unit_price) values ($1, $2, 101, 1)`, [id, ore])
      await t.db.query(`select merchant.post_sale($1)`, [id])
    })
    expect(await oreStock()).toBe(-1)
  })

  it('a line cannot be both a good and a material', async () => {
    await t.as(employee, async () => {
      const id = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [employee])).id
      await expect(t.db.query(`insert into merchant.sale_lines (sale_id, good_id, material_id, quantity, unit_price) values ($1, $2, $3, 1, 1)`,
        [id, sword, ore])).rejects.toThrow(/sale_line_one_item/)
    })
  })
})
