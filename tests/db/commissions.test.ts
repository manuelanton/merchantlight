import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

// 2026-10-05: several employees per commission (credited per piece) + customer-provided materials.
let t: TestDb
const u = {} as Record<'owner' | 'anna' | 'bert', string>
const id = {} as Record<string, string>

const stock = async (name: string) => (await t.one<{ stock: number }>(`select stock from merchant.materials where name = $1`, [name])).stock
type Summary = { person_id: string; earned: number }
const earned = async () =>
  Object.fromEntries((await t.as(u.owner, () => t.rows<Summary>(`select * from merchant.payout_summary()`))).map((r) => [r.person_id, r.earned]))

beforeAll(async () => {
  t = await createDb()
  u.owner = await t.createUser('owner', 'Owner')
  u.anna = await t.createUser('employee', 'Anna')
  u.bert = await t.createUser('employee', 'Bert')
  await t.as(u.owner, async () => {
    // Glass Dagger = 1 Malachite Ore (1000) + 1 Leather (3); Glass Boots = 2 Malachite Ore + 2 Leather
    for (const [n, price] of [['Malachite Ore', 1000], ['Leather', 3]] as const)
      id[n] = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ($1, $2) returning id`, [n, price])).id
    for (const [n, price] of [['Glass Dagger', 1500], ['Glass Boots', 3000]] as const)
      id[n] = (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ($1, $2) returning id`, [n, price])).id
    const rc = `insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, $3)`
    await t.db.query(rc, [id['Glass Dagger'], id['Malachite Ore'], 1])
    await t.db.query(rc, [id['Glass Dagger'], id['Leather'], 1])
    await t.db.query(rc, [id['Glass Boots'], id['Malachite Ore'], 2])
    await t.db.query(rc, [id['Glass Boots'], id['Leather'], 2])
    await t.db.query(`select merchant.adjust_stock('material', $1, 3, 'Correction')`, [id['Malachite Ore']])
    await t.db.query(`select merchant.adjust_stock('material', $1, 10, 'Correction')`, [id['Leather']])
  })
})

describe('commission with two employees and customer materials', () => {
  let order: string
  let lines: { id: string; good_id: string }[]

  it('pieces can be assigned: employees sign themselves up, not others', async () => {
    order = (await t.as(u.owner, () => t.one<{ id: string }>(`select * from merchant.create_order('Kalos', $1::jsonb)`,
      [JSON.stringify([{ good_id: id['Glass Dagger'], qty: 1 }, { good_id: id['Glass Boots'], qty: 1 }])]))).id
    lines = await t.rows(`select id, good_id from merchant.order_lines where order_id = $1 order by sort`, [order])
    await t.as(u.anna, () => t.db.query(`select merchant.set_order_line_crafter($1, $2)`, [lines[0].id, u.anna]))
    await t.as(u.anna, async () => {
      await expect(t.db.query(`select merchant.set_order_line_crafter($1, $2)`, [lines[1].id, u.bert])).rejects.toThrow(/sign yourself/)
    })
    await t.as(u.owner, () => t.db.query(`select merchant.set_order_line_crafter($1, $2)`, [lines[1].id, u.bert]))
  })

  it('customer brings 2 Malachite Ore for the boots: not needed from stock, price and cost drop', async () => {
    // boots need 2 ore + 2 leather; customer brings the 2 ore → price 3000 − 2×1000 value = 1000
    await t.as(u.owner, () => t.db.query(`select merchant.set_order_line_provided($1, $2::jsonb, 1000)`,
      [lines[1].id, JSON.stringify([{ kind: 'material', item_id: id['Malachite Ore'], qty: 2 }])]))
    const ov = await t.as(u.owner, () => t.one<{ o: { short: boolean; reservations: { name: string; qty: number }[]; lines: { cost: number }[] } }>(
      `select merchant.order_overview($1) as o`, [order])).then((r) => r.o)
    expect(Object.fromEntries(ov.reservations.map((r) => [r.name, r.qty]))).toEqual({ 'Malachite Ore': 1, Leather: 3 })
    expect(ov.short).toBe(false)
    expect(ov.lines.map((l) => l.cost)).toEqual([1003, 6]) // boots: only 2 leather count as cost
  })

  it('delivering posts one receipt and credits each employee for their piece', async () => {
    const s = await t.as(u.owner, () => t.one<{ net_total: number; commission_amount: number }>(`select * from merchant.deliver_order($1)`, [order]))
    expect(s.net_total).toBe(2500) // 1500 + 1000
    // dagger (Anna): 1500 − 1003 − 150 = 347; boots (Bert): 1000 − 6 − 100 = 894
    expect(s.commission_amount).toBe(1241)
    const e = await earned()
    expect([e[u.anna], e[u.bert], e[u.owner] ?? 0]).toEqual([347, 894, 0])
    expect(await stock('Malachite Ore')).toBe(3) // sales take the goods, not their materials
  })

  it('reopening and deleting the receipt removes the credits again', async () => {
    const sid = (await t.one<{ sale_id: string }>(`select sale_id from merchant.orders where id = $1`, [order])).sale_id
    await t.as(u.owner, () => t.db.query(`delete from merchant.sales where id = $1`, [sid]))
    const e = await earned()
    expect(e[u.anna] ?? 0).toBe(0)
    expect(await stock('Malachite Ore')).toBe(3)
  })
})

describe('receipts', () => {
  it('a receipt line can carry customer materials and a different crafter', async () => {
    const sid = await t.as(u.anna, async () => {
      const sid = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [u.anna])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price, crafted_by, provided) values ($1, $2, 1, 500, $3, $4::jsonb)`,
        [sid, id['Glass Dagger'], u.bert, JSON.stringify([{ kind: 'material', item_id: id['Malachite Ore'], qty: 1 }])])
      await t.db.query(`select merchant.post_sale($1)`, [sid])
      return sid
    })
    expect(await stock('Malachite Ore')).toBe(3) // customer brought the ore
    const line = await t.one<{ unit_cost: number; payout: number }>(`select unit_cost, payout from merchant.sale_lines where sale_id = $1`, [sid])
    expect(line).toEqual({ unit_cost: 3, payout: 447 }) // 500 − 3 − 50, credited to Bert
    expect((await earned())[u.bert]).toBe(447)
  })
})
