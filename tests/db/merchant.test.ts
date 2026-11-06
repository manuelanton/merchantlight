import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

let t: TestDb
const u = {} as Record<'owner' | 'manager' | 'employee' | 'employee2' | 'supplier' | 'visitor', string>
const id = {} as Record<string, string>

const stock = async (table: 'materials' | 'goods', name: string) =>
  (await t.one<{ stock: number }>(`select stock from merchant.${table} where name = $1`, [name])).stock
const balance = async () =>
  (await t.one<{ b: number }>(`select coalesce(sum(money_in - money_out), 0) as b from merchant.treasury_entries`)).b

beforeAll(async () => {
  t = await createDb()
  u.owner = await t.createUser('owner', 'Owner')
  u.manager = await t.createUser('manager', 'Manager')
  u.employee = await t.createUser('employee', 'Employee')
  u.employee2 = await t.createUser('employee', 'Employee2')
  u.supplier = await t.createUser('supplier', 'Supplier')
  u.visitor = await t.createUser('visitor', 'Visitor')

  await t.as(u.manager, async () => {
    for (const [name, price] of [['Iron ore', 5], ['Coal', 2], ['Leather', 4]] as const) {
      id[name] = (await t.one<{ id: string }>(
        `insert into merchant.materials (name, buy_price, category) values ($1, $2, 'Raw') returning id`, [name, price])).id
    }
    for (const [name, price] of [['Iron ingot', 20], ['Sword', 120]] as const) {
      id[name] = (await t.one<{ id: string }>(
        `insert into merchant.goods (name, sell_price, category) values ($1, $2, 'Weapons') returning id`, [name, price])).id
    }
    const rc = `insert into merchant.recipe_components (good_id, material_id, component_good_id, quantity) values ($1, $2, $3, $4)`
    await t.db.query(rc, [id['Iron ingot'], id['Iron ore'], null, 2])
    await t.db.query(rc, [id['Iron ingot'], id['Coal'], null, 1])
    await t.db.query(rc, [id['Sword'], null, id['Iron ingot'], 3])
    await t.db.query(rc, [id['Sword'], id['Leather'], null, 1])
  })
})

describe('next to the old Merchantlight tables', () => {
  it('leaves public-schema objects alone and keeps them out of the app role', async () => {
    const r = await t.one<{ sel: boolean; ins: boolean; mgr: boolean }>(`select
      has_table_privilege('merchant_app', 'public.stock_movements', 'select') as sel,
      has_table_privilege('merchant_app', 'public.stock_movements', 'insert') as ins,
      public.is_manager() as mgr`)
    expect(r).toEqual({ sel: false, ins: false, mgr: true })
  })
})

describe('roles & RLS', () => {
  it('visitor sees nothing, supplier sees materials only', async () => {
    await t.as(u.visitor, async () => {
      expect(await t.rows(`select * from merchant.materials`)).toHaveLength(0)
      expect(await t.rows(`select * from merchant.goods`)).toHaveLength(0)
    })
    await t.as(u.supplier, async () => {
      expect(await t.rows(`select * from merchant.materials`)).toHaveLength(3)
      expect(await t.rows(`select * from merchant.goods`)).toHaveLength(0)
      expect(await t.rows(`select * from merchant.treasury_entries`)).toHaveLength(0)
    })
  })

  it('employee cannot write the catalog', async () => {
    await t.as(u.employee, async () => {
      await expect(t.db.query(`insert into merchant.materials (name) values ('Gold')`)).rejects.toThrow(/row-level security/)
      const r = await t.db.query(`update merchant.goods set sell_price = 1 where name = 'Sword'`)
      expect(r.affectedRows).toBe(0)
    })
  })

  it('nobody can write stock directly', async () => {
    await t.as(u.owner, async () => {
      await expect(t.db.query(`update merchant.materials set stock = 99`)).rejects.toThrow(/permission denied/)
    })
  })

  it('settings & role management are owner-only (also for manager)', async () => {
    await t.as(u.manager, async () => {
      const r = await t.db.query(`update merchant.settings set company_share = 0.5`)
      expect(r.affectedRows).toBe(0)
      await expect(t.db.query(`select merchant.set_role_override($1, 'manager')`, [u.employee])).rejects.toThrow(/Not allowed/)
    })
    await t.as(u.owner, async () => {
      await expect(t.db.query(`select merchant.set_role_override($1, 'visitor')`, [u.owner])).rejects.toThrow(/own role/)
      await t.db.query(`select merchant.set_role_override($1, 'supplier')`, [u.employee2])
      expect((await t.one<{ role: string }>(`select role from merchant.profiles where id = $1`, [u.employee2])).role).toBe('supplier')
      await t.db.query(`select merchant.set_role_override($1, null)`, [u.employee2])
      expect((await t.one<{ role: string }>(`select role from merchant.profiles where id = $1`, [u.employee2])).role).toBe('employee')
    })
  })

  it('numbers come back as JS numbers', async () => {
    const m = await t.one<{ buy_price: unknown }>(`select buy_price from merchant.materials where name = 'Iron ore'`)
    expect(typeof m.buy_price).toBe('number')
  })
})

describe('cost engine', () => {
  it('computes recursive unit costs', async () => {
    const costs = await t.as(u.employee, () =>
      t.rows<{ good_id: string; unit_cost: number }>(`select * from merchant.good_costs()`))
    const by = Object.fromEntries(costs.map((c) => [c.good_id, c.unit_cost]))
    expect(by[id['Iron ingot']]).toBe(12) // 2×5 + 2
    expect(by[id['Sword']]).toBe(40) // 3×12 + 4
  })

  it('rejects circular recipes on write', async () => {
    await t.as(u.manager, async () => {
      await expect(t.db.query(
        `insert into merchant.recipe_components (good_id, component_good_id, quantity) values ($1, $2, 1)`,
        [id['Iron ingot'], id['Sword']])).rejects.toThrow(/Circular recipe/)
    })
  })

  it('reports cycles that slipped in (e.g. via import) instead of looping', async () => {
    await t.db.exec(`alter table merchant.recipe_components disable trigger recipe_components_cycle_guard`)
    await t.db.query(`insert into merchant.recipe_components (good_id, component_good_id, quantity) values ($1, $2, 1)`,
      [id['Iron ingot'], id['Sword']])
    const costs = await t.as(u.employee, () => t.rows<{ good_id: string; cost_error: string | null }>(`select * from merchant.good_costs()`))
    expect(costs.find((c) => c.good_id === id['Sword'])?.cost_error).toMatch(/Sword → Iron ingot → Sword/)
    await t.db.query(`delete from merchant.recipe_components where good_id = $1 and component_good_id = $2`, [id['Iron ingot'], id['Sword']])
    await t.db.exec(`alter table merchant.recipe_components enable trigger recipe_components_cycle_guard`)
  })
})

describe('purchasing, crafting, stock log', () => {
  it('purchase books stock, treasury and movement log', async () => {
    await t.as(u.employee, async () => {
      await expect(t.db.query(`select merchant.create_purchase('[]'::jsonb)`)).rejects.toThrow(/Not allowed/)
    })
    await t.as(u.manager, async () => {
      await t.db.query(`select merchant.create_purchase($1::jsonb, 'Mine Co')`, [JSON.stringify([
        { kind: 'material', item_id: id['Iron ore'], qty: 10, unit_price: 5 },
        { kind: 'material', item_id: id['Coal'], qty: 5, unit_price: 2 },
      ])])
    })
    expect(await stock('materials', 'Iron ore')).toBe(10)
    expect(await balance()).toBe(-60)
    const mv = await t.rows(`select * from merchant.stock_movements where reason = 'Purchase'`)
    expect(mv).toHaveLength(2)
  })

  it('craft preview + craft consume exactly the recipe', async () => {
    const preview = await t.as(u.employee, () =>
      t.one<{ p: { ok: boolean; lines: { name: string; qty: number }[] } }>(
        `select merchant.craft_preview($1, 2) as p`, [id['Iron ingot']]))
    expect(preview.p.ok).toBe(true)
    expect(preview.p.lines.map((l) => [l.name, l.qty])).toEqual([['Coal', 2], ['Iron ore', 4]])

    await t.as(u.employee, () => t.db.query(`select merchant.craft($1, 2)`, [id['Iron ingot']]))
    expect(await stock('goods', 'Iron ingot')).toBe(2)
    expect(await stock('materials', 'Iron ore')).toBe(6)
    expect(await stock('materials', 'Coal')).toBe(3)
  })

  it('previews a shortfall precisely, without consuming anything', async () => {
    // 2 ingots in stock < 3 needed → the ingots' own materials are used instead; leather is missing.
    const r = await t.as(u.employee, () => t.one<{ p: { ok: boolean; missing_text: string } }>(
      `select merchant.craft_preview($1, 1) as p`, [id['Sword']]))
    expect(r.p.ok).toBe(false)
    expect(r.p.missing_text).toContain('Leather (need 1, available 0, missing 1)')
    expect(await stock('materials', 'Iron ore')).toBe(6)
  })

  it('can-craft preview shows max qty and limiting item', async () => {
    const cap = await t.as(u.employee, () => t.rows<{ good_id: string; max_qty: number; limiting: string }>(
      `select * from merchant.craft_capacity()`))
    const ingot = cap.find((c) => c.good_id === id['Iron ingot'])!
    expect(ingot.max_qty).toBe(3) // ore 6/2 = 3, coal 3/1 = 3
    const sword = cap.find((c) => c.good_id === id['Sword'])!
    expect(sword.max_qty).toBe(0)
    expect(sword.limiting).toMatch(/Leather/)
  })

  it('stock log is append-only for everyone', async () => {
    await t.as(u.owner, async () => {
      await expect(t.db.query(`delete from merchant.stock_movements`)).rejects.toThrow(/permission denied/)
      await expect(t.db.query(`update merchant.stock_movements set delta = 1`)).rejects.toThrow(/permission denied/)
    })
  })

  it('stock corrections are logged with reason', async () => {
    await t.as(u.manager, () => t.db.query(
      `select merchant.adjust_stock('material', $1, 3, 'Correction', 'found in shed')`, [id['Leather']]))
    expect(await stock('materials', 'Leather')).toBe(3)
    await t.as(u.employee, async () => {
      await expect(t.db.query(`select merchant.adjust_stock('material', $1, -1, 'Waste')`, [id['Leather']]))
        .rejects.toThrow(/Not allowed/)
    })
  })
})

describe('sales, commission, reversal', () => {
  let saleId: string

  it('employee can only sell in their own name', async () => {
    await t.as(u.employee, async () => {
      await expect(t.db.query(`insert into merchant.sales (seller_id) values ($1)`, [u.manager])).rejects.toThrow(/row-level security/)
      saleId = (await t.one<{ id: string }>(
        `insert into merchant.sales (seller_id, customer, discount, tip) values ($1, 'Bob', 4, 5) returning id`, [u.employee])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 2, 20)`,
        [saleId, id['Iron ingot']])
    })
    await t.as(u.employee2, async () => {
      expect(await t.rows(`select * from merchant.sales`)).toHaveLength(0)
    })
  })

  it('posting books income + employee payout (sale − material − 10% merchant keep) and deducts stock', async () => {
    const before = await balance()
    const preview = await t.as(u.employee, () => t.one<{ p: Record<string, number> }>(
      `select merchant.sale_post_preview($1) as p`, [saleId]))
    expect(preview.p.net_total).toBe(36)
    // sale 36 (after discount, tip excluded) − material 24 − merchant keep 3.6 (10% of 36) = employee 8.4
    expect(preview.p.cost_total).toBe(24)
    expect(preview.p.merchant_keep).toBe(3.6)
    expect(preview.p.commission_amount).toBe(8.4)

    const s = await t.as(u.employee, () => t.one<Record<string, number | string>>(
      `select * from merchant.post_sale($1)`, [saleId]))
    expect(s.status).toBe('posted')
    expect(s.net_total).toBe(36)
    expect(s.cost_total).toBe(24)
    expect(s.commission_amount).toBe(8.4)
    expect(s.company_share).toBe(0.1)
    expect(await stock('goods', 'Iron ingot')).toBe(0)

    const entries = await t.rows<{ category: string; money_in: number; money_out: number; beneficiary_id: string }>(
      `select category, money_in, money_out, beneficiary_id from merchant.treasury_entries where ref_id = $1 order by id`, [saleId])
    // The payout (8.4) is only earned here; it leaves the treasury when a manager records the payment.
    expect(entries).toEqual([{ category: 'Sales income', money_in: 36, money_out: 0, beneficiary_id: null }])
    expect(await balance()).toBeCloseTo(before + 36)
  })

  it('posted receipts are locked; only managers may reopen/delete them', async () => {
    await t.as(u.employee, async () => {
      expect((await t.db.query(`update merchant.sales set customer = 'X' where id = $1`, [saleId])).affectedRows).toBe(0)
      await expect(t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 1, 1)`,
        [saleId, id['Sword']])).rejects.toThrow(/row-level security/)
    })
    await t.as(u.employee2, async () => {
      // another employee cannot touch it
      expect((await t.db.query(`delete from merchant.sales where id = $1`, [saleId])).affectedRows).toBe(0)
      await expect(t.db.query(`select merchant.unpost_sale($1)`, [saleId])).rejects.toThrow(/Not allowed/)
    })
  })

  it('deleting a posted receipt reverses stock AND income + commission', async () => {
    const before = await balance()
    await t.as(u.manager, () => t.db.query(`delete from merchant.sales where id = $1`, [saleId]))
    expect(await stock('goods', 'Iron ingot')).toBe(2)
    expect(await t.rows(`select * from merchant.treasury_entries where ref_id = $1`, [saleId])).toHaveLength(0)
    expect(await balance()).toBeCloseTo(before - 36)
    const rev = await t.rows(`select * from merchant.stock_movements where ref_id = $1 and reverses_id is not null`, [saleId])
    expect(rev).toHaveLength(1)
  })

  it('a sale takes only the goods sold: no crafting, stock may go negative', async () => {
    expect(await stock('materials', 'Iron ore')).toBe(6)
    await t.as(u.manager, async () => {
      const sid = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [u.employee2])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 3, 20)`, [sid, id['Iron ingot']])
      await t.db.query(`select merchant.post_sale($1)`, [sid])
    })
    expect(await stock('goods', 'Iron ingot')).toBe(-1)
    expect(await stock('materials', 'Iron ore')).toBe(6)
    expect(await stock('materials', 'Coal')).toBe(3)
  })
})

describe('editing receipts and purchases', () => {
  it('a posted receipt can be reopened, edited and posted again', async () => {
    await t.db.query(`update merchant.goods set stock = stock + 1 where name = 'Iron ingot'`)
    const before = await balance()
    const ingot = await stock('goods', 'Iron ingot')
    const sid = await t.as(u.employee, async () => {
      const sid = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id) values ($1) returning id`, [u.employee])).id
      await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, 1, 20)`, [sid, id['Iron ingot']])
      await t.db.query(`select merchant.post_sale($1)`, [sid])
      return sid
    })
    expect(await stock('goods', 'Iron ingot')).toBe(ingot - 1)
    await t.as(u.manager, () => t.db.query(`select merchant.unpost_sale($1)`, [sid]))
    expect(await stock('goods', 'Iron ingot')).toBe(ingot)
    expect(await balance()).toBeCloseTo(before)
    await t.as(u.employee, async () => {
      await t.db.query(`update merchant.sale_lines set unit_price = 25 where sale_id = $1`, [sid])
      const s = await t.one<{ net_total: number }>(`select * from merchant.post_sale($1)`, [sid])
      expect(s.net_total).toBe(25)
      // like the Tavern, the seller cannot; a manager can, and everything is reversed
      expect((await t.db.query(`delete from merchant.sales where id = $1`, [sid])).affectedRows).toBe(0)
    })
    await t.as(u.manager, async () => {
      expect((await t.db.query(`delete from merchant.sales where id = $1`, [sid])).affectedRows).toBe(1)
    })
    expect(await stock('goods', 'Iron ingot')).toBe(ingot)
    expect(await balance()).toBeCloseTo(before)
  })

  it('a purchase can be edited even after part of it was used', async () => {
    const ore = await stock('materials', 'Iron ore')
    const p = await t.as(u.manager, () => t.one<{ id: string }>(`select * from merchant.create_purchase($1::jsonb, 'Mine')`,
      [JSON.stringify([{ kind: 'material', item_id: id['Iron ore'], qty: 10, unit_price: 1 }])]))
    await t.as(u.manager, () => t.db.query(`select merchant.adjust_stock('material', $1, -8, 'Waste')`, [id['Iron ore']]))
    const edited = await t.as(u.manager, () => t.one<{ total: number }>(`select * from merchant.update_purchase($1, $2::jsonb, 'Mine B')`,
      [p.id, JSON.stringify([{ kind: 'material', item_id: id['Iron ore'], qty: 12, unit_price: 0.5 }])]))
    expect(edited.total).toBe(6)
    expect(await stock('materials', 'Iron ore')).toBe(ore + 10 - 8 + 2)
    const t1 = await t.rows<{ money_out: number }>(`select money_out from merchant.treasury_entries where ref_id = $1`, [p.id])
    expect(t1).toEqual([{ money_out: 6 }])
    await t.as(u.manager, () => t.db.query(`select merchant.adjust_stock('material', $1, 8, 'Correction')`, [id['Iron ore']]))
    await t.as(u.manager, () => t.db.query(`delete from merchant.purchases where id = $1`, [p.id]))
    expect(await stock('materials', 'Iron ore')).toBe(ore)
  })

})

describe('profit share edge cases', () => {
  it('no commission when a receipt makes no profit', async () => {
    const r = await t.one<{ c: number }>(`select merchant._employee_commission(20, 30, 0.1) as c`)
    expect(r.c).toBe(0)
  })
})

describe('treasury & rentals', () => {
  it('manual entries: managers only, never system categories', async () => {
    await t.as(u.employee, async () => {
      expect(await t.rows(`select * from merchant.treasury_entries`)).toHaveLength(0)
      await expect(t.db.query(`insert into merchant.treasury_entries (category, money_out) values ('Wages', 10)`))
        .rejects.toThrow(/row-level security/)
    })
    await t.as(u.manager, async () => {
      await t.db.query(`insert into merchant.treasury_entries (category, money_out, description) values ('Wages', 10, 'Week 1')`)
      await expect(t.db.query(`insert into merchant.treasury_entries (category, money_in) values ('Sales income', 1000)`))
        .rejects.toThrow(/row-level security/)
      // Document-linked entries can't be deleted directly.
      expect((await t.db.query(`delete from merchant.treasury_entries where ref_type is not null`)).affectedRows).toBe(0)
    })
  })

  it('storage rentals book weekly income and reverse on delete', async () => {
    await t.as(u.manager, async () => {
      const unit = (await t.one<{ id: string }>(
        `insert into merchant.storage_units (name, weekly_price) values ('Locker A', 100) returning id`)).id
      const r = await t.one<{ id: string; paid_until: string }>(
        `select * from merchant.create_rental($1, 'Alice', 2, '2026-09-01')`, [unit])
      await expect(t.db.query(`select merchant.create_rental($1, 'Eve', 1)`, [unit])).rejects.toThrow(/already rented/)
      await t.db.query(`select merchant.extend_rental($1, 1)`, [r.id])
      const income = await t.one<{ s: number }>(
        `select sum(money_in) as s from merchant.treasury_entries where ref_id = $1`, [r.id])
      expect(income.s).toBe(300)
      await t.db.query(`delete from merchant.rentals where id = $1`, [r.id])
      expect(await t.rows(`select * from merchant.treasury_entries where ref_id = $1`, [r.id])).toHaveLength(0)
    })
  })

  it('deleting a purchase takes its stock back, even below zero', async () => {
    const p = await t.one<{ id: string }>(`select id from merchant.purchases limit 1`)
    const before = await stock('materials', 'Iron ore')
    await t.as(u.manager, () => t.db.query(`delete from merchant.purchases where id = $1`, [p.id]))
    expect(await stock('materials', 'Iron ore')).toBe(before - 10)
  })
})
