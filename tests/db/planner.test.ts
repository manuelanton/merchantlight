import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

// Regression (2026-09-26): Iron Arrow = 1 Firewood + 1 Iron Ingot. When the ingot isn't in
// stock and its ore is short too, the craft preview listed "Iron Ore missing …" instead
// of the missing Iron Ingot. A sub-good only falls back to its materials if they suffice.
let t: TestDb
let employee: string
const id = {} as Record<string, string>

type Preview = { ok: boolean; missing_text: string | null; lines: { name: string; qty: number }[] }
const preview = (good: string) =>
  t.as(employee, () => t.one<{ p: Preview }>(`select merchant.craft_preview($1, 1) as p`, [id[good]])).then((r) => r.p)
const setStock = (table: 'materials' | 'goods', name: string, n: number) =>
  t.db.query(`update merchant.${table} set stock = $2 where name = $1`, [name, n])

beforeAll(async () => {
  t = await createDb()
  const manager = await t.createUser('manager', 'Manager')
  employee = await t.createUser('employee', 'Employee')
  await t.as(manager, async () => {
    for (const n of ['Iron Ore', 'Poor Charcoal', 'Firewood'])
      id[n] = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ($1, 0.5) returning id`, [n])).id
    for (const n of ['Iron Ingot', 'Iron Arrow'])
      id[n] = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ($1, 10) returning id`, [n])).id
    const rc = `insert into merchant.recipe_components (good_id, material_id, component_good_id, quantity) values ($1, $2, $3, $4)`
    await t.db.query(rc, [id['Iron Ingot'], id['Iron Ore'], null, 6])
    await t.db.query(rc, [id['Iron Ingot'], id['Poor Charcoal'], null, 6])
    await t.db.query(rc, [id['Iron Arrow'], id['Firewood'], null, 1])
    await t.db.query(rc, [id['Iron Arrow'], null, id['Iron Ingot'], 1])
  })
  await setStock('materials', 'Firewood', 100)
  await setStock('materials', 'Poor Charcoal', 100)
})

describe('sub-good fallback', () => {
  it('uses the ingot from stock when there is one', async () => {
    await setStock('goods', 'Iron Ingot', 3)
    await setStock('materials', 'Iron Ore', 2)
    const p = await preview('Iron Arrow')
    expect(p.ok).toBe(true)
    expect(p.lines.map((l) => l.name).sort()).toEqual(['Firewood', 'Iron Ingot'])
  })

  it('reports the missing ingot instead of switching to ore that is short too', async () => {
    await setStock('goods', 'Iron Ingot', 0)
    const p = await preview('Iron Arrow')
    expect(p.lines.map((l) => l.name).sort()).toEqual(['Firewood', 'Iron Ingot'])
    expect(p.missing_text).toMatch(/Iron Ingot \(need 1, available 0, missing 1\)/)
  })

  it('smelts the ingot on the spot when enough ore and charcoal exist', async () => {
    await setStock('materials', 'Iron Ore', 12)
    const p = await preview('Iron Arrow')
    expect(p.ok).toBe(true)
    expect(p.lines.map((l) => l.name).sort()).toEqual(['Firewood', 'Iron Ore', 'Poor Charcoal'])
  })

  it('open orders never block stock: an order needing 20 ingots does not stop crafting arrows from 16', async () => {
    await setStock('goods', 'Iron Ingot', 16)
    await t.as(employee, () => t.db.query(`select merchant.create_order('Big', $1::jsonb)`,
      [JSON.stringify([{ good_id: id['Iron Ingot'], qty: 20 }])]))
    await t.as(employee, () => t.db.query(`select merchant.craft($1, 16)`, [id['Iron Arrow']]))
    expect((await t.one<{ stock: number }>(`select stock from merchant.goods where name = 'Iron Arrow'`)).stock).toBe(16)
  })
})

describe('partial stock', () => {
  it('crafting uses the sub-goods in stock and makes only the rest', async () => {
    // Recipe needing 5 ingots: 3 in stock → 3 taken + 2 smelted (12 ore, 12 charcoal)
    await setStock('goods', 'Iron Ingot', 3)
    await setStock('materials', 'Iron Ore', 100)
    const bundle = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Arrow Bundle', 50) returning id`)).id
    await t.db.query(`insert into merchant.recipe_components (good_id, component_good_id, quantity) values ($1, $2, 5)`, [bundle, id['Iron Ingot']])
    const p = await t.as(employee, () => t.one<{ p: { lines: { name: string; qty: number }[] } }>(
      `select merchant.craft_preview($1, 1) as p`, [bundle]))
    expect(Object.fromEntries(p.p.lines.map((l) => [l.name, l.qty]))).toEqual({ 'Iron Ingot': 3, 'Iron Ore': 12, 'Poor Charcoal': 12 })
  })
})
