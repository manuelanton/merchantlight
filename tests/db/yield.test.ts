import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

// Recipes have a yield: 1 Leather → 4 Leather Strips, a crafted material.
let t: TestDb
let employee: string
let manager: string
const id = {} as Record<string, string>

const stock = async (table: 'materials' | 'goods', name: string) =>
  (await t.one<{ stock: number }>(`select stock from merchant.${table} where name = $1`, [name])).stock

beforeAll(async () => {
  t = await createDb()
  manager = await t.createUser('manager', 'Manager')
  employee = await t.createUser('employee', 'Employee')
  await t.as(manager, async () => {
    id['Leather'] = (await t.one<{ id: string }>(`insert into merchant.materials (name, category, buy_price, sell_price) values ('Leather', 'Leather', 3, 1) returning id`)).id
    id['Leather Armor'] = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Leather Armor', 20) returning id`)).id
    id['Strips'] = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Leather Strips', 1) returning id`)).id
  })
  await t.db.query(`update merchant.goods set is_material = true, craft_yield = 4 where id = $1`, [id['Strips']])
  await t.as(manager, async () => {
    await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 1)`, [id['Strips'], id['Leather']])
    await t.db.query(`insert into merchant.recipe_components (good_id, component_good_id, quantity) values ($1, $2, 3)`, [id['Leather Armor'], id['Strips']])
    await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 2)`, [id['Leather Armor'], id['Leather']])
    await t.db.query(`select merchant.adjust_stock('material', $1, 20, 'Correction')`, [id['Leather']])
    await t.db.query(`select merchant.adjust_stock('good', $1, 10, 'Correction')`, [id['Strips']])
  })
})

describe('recipe yield', () => {
  it('divides the unit cost by the yield', async () => {
    const c = await t.as(employee, () => t.one<{ unit_cost: number }>(`select unit_cost from merchant.good_costs() where good_id = $1`, [id['Strips']]))
    expect(c.unit_cost).toBe(0.75) // 3 / 4
  })

  it('crafting 5 strips makes whole crafts: 2 leather → 8 strips', async () => {
    const leather = await stock('materials', 'Leather')
    const c = await t.as(employee, () => t.one<{ quantity: number }>(`select * from merchant.craft($1, 5)`, [id['Strips']]))
    expect(c.quantity).toBe(8)
    expect(await stock('materials', 'Leather')).toBe(leather - 2)
    expect(await stock('goods', 'Leather Strips')).toBe(18)
  })

  it('armor needing strips takes them from stock first, then crafts whole batches and keeps the extra', async () => {
    await t.db.query(`update merchant.goods set stock = 1 where id = $1`, [id['Strips']])
    const leather = await stock('materials', 'Leather')
    // 1 armor needs 3 strips: 1 from stock + 2 more → 1 craft (1 leather → 4), 2 left over; plus 2 leather direct
    await t.as(employee, () => t.db.query(`select merchant.craft($1, 1)`, [id['Leather Armor']]))
    expect(await stock('materials', 'Leather')).toBe(leather - 3)
    expect(await stock('goods', 'Leather Strips')).toBe(2)
  })

  it('selling strips that are not in stock goes negative instead of crafting', async () => {
    await t.db.query(`update merchant.goods set stock = 0 where id = $1`, [id['Strips']])
    const leather = await stock('materials', 'Leather')
    await t.as(employee, async () => {
      const sid = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [employee])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 1, 1)`, [sid, id['Strips']])
      await t.db.query(`select merchant.post_sale($1)`, [sid])
    })
    expect(await stock('materials', 'Leather')).toBe(leather)
    expect(await stock('goods', 'Leather Strips')).toBe(-1)
  })

  it('the preview only lists what is taken, not the returned surplus', async () => {
    await t.db.query(`update merchant.goods set stock = 0 where id = $1`, [id['Strips']])
    const p = await t.as(employee, () => t.one<{ p: { lines: { name: string; qty: number }[] } }>(
      `select merchant.craft_preview($1, 1) as p`, [id['Leather Armor']]))
    expect(Object.fromEntries(p.p.lines.map((l) => [l.name, l.qty]))).toEqual({ Leather: 3 }) // 2 direct + 1 for a strip craft
  })
})
