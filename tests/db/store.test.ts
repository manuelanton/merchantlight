import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

let t: TestDb
let owner: string, manager: string, employee: string
const WEEK = '2026-10-05' // a Monday
const NEXT = '2026-10-12'

const stock = async (table: 'materials' | 'goods', id: string) =>
  (await t.one<{ stock: number }>(`select stock from merchant.${table} where id = $1`, [id])).stock

async function good(name: string, price: number) {
  return (await t.one<{ id: string }>(`insert into merchant.goods (name, sell_price, buy_price) values ($1, $2, 0) returning id`, [name, price])).id
}

async function sell(goodId: string, qty: number, price: number, date = `${WEEK} 12:00+00`) {
  const id = (await t.one<{ id: string }>(`insert into merchant.sales (seller_id, sale_date) values ($1, $2) returning id`, [manager, date])).id
  await t.db.query(`insert into merchant.sale_lines (sale_id, good_id, quantity, unit_price) values ($1, $2, $3, $4)`, [id, goodId, qty, price])
  await t.db.query(`select merchant.post_sale($1)`, [id])
  return id
}

const expense = (out: number, category = 'Rent', date = `${WEEK} 13:00+00`) =>
  t.db.query(`insert into merchant.treasury_entries (entry_date, category, description, money_out) values ($1, $2, 'x', $3)`, [date, category, out])

beforeAll(async () => {
  t = await createDb()
  // The harness keeps the Forge's commission on for the ported tests; these test the store's real settings.
  await t.db.exec(`update merchant.settings set employee_profit_share = 0, profit_split_from = '-infinity'`)
  owner = await t.createUser('owner', 'Olaf')
  manager = await t.createUser('manager', 'Mira')
  employee = await t.createUser('employee', 'Erik')
})

describe('stock like the Tavern', () => {
  it('sells what is not in stock and goes negative', async () => {
    await t.as(manager, async () => {
      const g = await good('Rope', 10)
      await sell(g, 3, 10)
      expect(await stock('goods', g)).toBe(-3)
    })
  })

  it('never crafts during a sale', async () => {
    await t.as(manager, async () => {
      const mat = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ('Hemp', 1) returning id`)).id
      await t.db.query(`select merchant.adjust_stock('material', $1, 10, 'Correction')`, [mat])
      const g = await good('Twine', 5)
      await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 1)`, [g, mat])
      await sell(g, 2, 5)
      expect(await stock('goods', g)).toBe(-2)
      expect(await stock('materials', mat)).toBe(10)
    })
  })

  it('still counts the recipe as cost of the sale', async () => {
    const r = await t.one<{ cost_total: number }>(`select s.cost_total from merchant.sales s join merchant.sale_lines l on l.sale_id = s.id where l.good_name = 'Twine'`)
    expect(r.cost_total).toBe(2)
  })

  it('takes a bundle apart', async () => {
    await t.as(manager, async () => {
      const [pack, roll, bundle] = [await good('Pack', 30), await good('Bedroll', 20), await good('Traveller Set', 45)]
      await t.db.query(`insert into merchant.recipe_components (good_id, component_good_id, quantity) values ($1, $2, 1), ($1, $3, 2)`, [bundle, pack, roll])
      await t.db.query(`update merchant.goods set is_bundle = true where id = $1`, [bundle])
      await sell(bundle, 2, 45)
      expect(await stock('goods', bundle)).toBe(0)
      expect(await stock('goods', pack)).toBe(-2)
      expect(await stock('goods', roll)).toBe(-4)
    })
  })

  it('puts the stock back when a posted receipt is deleted', async () => {
    await t.as(manager, async () => {
      const g = await good('Lamp', 8)
      const sale = await sell(g, 4, 8)
      await t.db.query(`delete from merchant.sales where id = $1`, [sale])
      expect(await stock('goods', g)).toBe(0)
    })
  })

  it('does not refuse crafting without materials', async () => {
    await t.as(manager, async () => {
      const mat = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ('Wax', 1) returning id`)).id
      const g = await good('Candle', 2)
      await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 1)`, [g, mat])
      await t.db.query(`select merchant.craft($1, 3)`, [g])
      expect(await stock('goods', g)).toBe(3)
      expect(await stock('materials', mat)).toBe(-3)
    })
  })
})

describe('partner split', () => {
  // A fresh database per scenario keeps the weeks' numbers exact.
  beforeAll(async () => {
    t = await createDb()
    await t.db.exec(`update merchant.settings set employee_profit_share = 0, profit_split_from = '-infinity'`)
    owner = await t.createUser('owner', 'Olaf')
    manager = await t.createUser('manager', 'Mira')
    employee = await t.createUser('employee', 'Erik')
  })

  const week = (user: string, w = WEEK) => t.as(user, () => t.one<{ w: Record<string, unknown> }>(`select merchant.partner_week($1) as w`, [w]))
  const close = (user: string, w = WEEK) => t.as(user, () => t.db.query(`select merchant.close_partner_week($1)`, [w]))

  it('pays no commission on a receipt', async () => {
    await t.as(manager, async () => {
      const mat = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ('Cloth', 4) returning id`)).id
      const g = await good('Cloak', 104)
      await t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 1)`, [g, mat])
      await sell(g, 1, 104)
    })
    expect(await t.one(`select commission_amount from merchant.sales`)).toEqual({ commission_amount: 0 })
  })

  it('divides income minus expenses by Owners and Managers, not Employees', async () => {
    await t.as(manager, () => expense(40))
    const { w } = await week(manager)
    expect(w).toMatchObject({ closed: false, sales_income: 104, expenses: 40, net: 64, per_partner: 32 })
    expect((w.partners as { name: string }[]).map((p) => p.name)).toEqual(['Mira', 'Olaf'])
  })

  it('counts purchases as expenses, withdrawals not', async () => {
    await t.db.query(`insert into merchant.treasury_entries (entry_date, category, description, money_out) values ($1, 'Material purchase', 'x', 500), ($1, 'Withdrawal', 'x', 300)`, ['2026-08-31 14:00+00'])
    expect((await week(manager, '2026-08-31')).w).toMatchObject({ sales_income: 0, expenses: 500, net: -500 })
  })

  it('counts rental income as profit', async () => {
    await t.db.query(`insert into merchant.treasury_entries (entry_date, category, description, money_in) values ($1, 'Rental income', 'x', 20), ($1, 'Deposit', 'x', 999)`, [`${WEEK} 15:00+00`])
    expect((await week(manager)).w).toMatchObject({ other_income: 20, net: 84, per_partner: 42 })
  })

  it('keeps it from Employees', async () => {
    await expect(week(employee)).rejects.toThrow(/Not allowed/)
    await expect(close(employee)).rejects.toThrow(/Not allowed/)
    await expect(t.as(employee, () => t.rows(`select * from merchant.partner_balances()`))).rejects.toThrow(/Not allowed/)
    await expect(t.as(employee, () => t.db.query(`select merchant.pay_partner($1, 5)`, [employee]))).rejects.toThrow(/Not allowed/)
    await t.as(manager, () => close(manager, '2026-09-28'))
    expect(await t.as(employee, () => t.rows(`select * from merchant.partner_weeks`))).toHaveLength(0)
  })

  it('refuses a week that is not over, is not a Monday, or is closed twice', async () => {
    const monday = await t.one<{ d: string }>(`select date_trunc('week', now() at time zone 'UTC')::date::text as d`)
    await expect(close(manager, monday.d)).rejects.toThrow(/not over/)
    await expect(close(manager, '2026-10-06')).rejects.toThrow(/Monday/)
    await expect(close(manager, '2026-09-28')).rejects.toThrow(/already closed/)
  })

  it('fixes the shares: a new Manager changes nothing afterwards', async () => {
    await close(manager)
    await t.createUser('manager', 'Newcomer')
    const { w } = await week(manager)
    expect(w).toMatchObject({ closed: true, per_partner: 42 })
    expect(w.partners).toHaveLength(2)
    // The next week does count the new Manager.
    expect(((await week(manager, NEXT)).w.partners as unknown[])).toHaveLength(3)
  })

  it('tracks balances and payouts, and a payout is no expense', async () => {
    await t.as(manager, () => t.db.query(`select merchant.pay_partner($1, 15, 'first')`, [owner]))
    const rows = await t.as(manager, () => t.rows<{ name: string; earned: number; paid: number; balance: number }>(`select * from merchant.partner_balances()`))
    expect(rows.find((r) => r.name === 'Olaf')).toMatchObject({ earned: 42, paid: 15, balance: 27 })
    expect(rows.find((r) => r.name === 'Mira')).toMatchObject({ earned: 42, paid: 0, balance: 42 })
    const now = await t.one<{ d: string }>(`select date_trunc('week', now() at time zone 'UTC')::date::text as d`)
    expect((await week(manager, now.d)).w).toMatchObject({ expenses: 0 })
  })

  it('takes a losing week off the balance', async () => {
    await expense(90, 'Rent', `${NEXT} 10:00+00`)
    await close(manager, NEXT)
    const { w } = await week(manager, NEXT)
    expect(w).toMatchObject({ net: -90, per_partner: -30 })
    const rows = await t.as(owner, () => t.rows<{ name: string; balance: number }>(`select * from merchant.partner_balances()`))
    expect(rows.find((r) => r.name === 'Mira')?.balance).toBe(12)
  })

  it('lets only the Owner reopen a week', async () => {
    await expect(t.as(manager, () => t.db.query(`select merchant.reopen_partner_week($1)`, [NEXT]))).rejects.toThrow(/Not allowed/)
    await t.as(owner, () => t.db.query(`select merchant.reopen_partner_week($1)`, [NEXT]))
    expect((await week(owner, NEXT)).w).toMatchObject({ closed: false })
  })
})

describe('building rent', () => {
  let manager: string, employee: string, owner: string
  const pay = (user: string, days: number, amount: number | null = null) =>
    t.as(user, () => t.db.query(`select merchant.pay_building_rent($1, $2)`, [days, amount]))

  beforeAll(async () => {
    t = await createDb()
    owner = await t.createUser('owner', 'Olaf')
    manager = await t.createUser('manager', 'Mira')
    employee = await t.createUser('employee', 'Erik')
  })

  it('books a Rent expense and moves the paid-until date', async () => {
    await pay(manager, 3)
    expect(await t.one(`select category, money_out, description from merchant.treasury_entries`))
      .toEqual({ category: 'Rent', money_out: 300, description: 'Building rent, 3 days' })
    expect(await t.one(`select round(extract(epoch from rent_paid_until - now()) / 86400)::int as days from merchant.settings`)).toEqual({ days: 3 })
  })

  it('takes a different amount but stops 7 days ahead', async () => {
    await pay(manager, 4, 50)
    await expect(pay(manager, 1)).rejects.toThrow(/7 days ahead/)
    expect(await t.one(`select sum(money_out) as total from merchant.treasury_entries`)).toEqual({ total: 350 })
  })

  it('is for Managers, and only the Owner changes the rate', async () => {
    await expect(pay(employee, 1)).rejects.toThrow(/Not allowed/)
    await t.as(manager, () => t.db.query(`update merchant.settings set building_rent_per_day = 1`))
    expect(await t.one(`select building_rent_per_day from merchant.settings`)).toEqual({ building_rent_per_day: 100 })
    await t.as(owner, () => t.db.query(`update merchant.settings set building_rent_per_day = 80, rent_paid_until = null`))
    await pay(manager, 1)
    expect(await t.one(`select money_out from merchant.treasury_entries order by created_at desc, money_out limit 1`)).toEqual({ money_out: 80 })
  })
})

describe('profit switch', () => {
  let manager: string, employee: string, owner: string
  const names = async () => {
    const { w } = await t.as(owner, () => t.one<{ w: { partners: { name: string }[] } }>(`select merchant.partner_week('2026-09-28') as w`))
    return w.partners.map((p) => p.name).sort()
  }
  const flip = (user: string, who: string, on: boolean) => t.as(user, () => t.db.query(`select merchant.set_profit_share($1, $2)`, [who, on]))

  beforeAll(async () => {
    t = await createDb()
    owner = await t.createUser('owner', 'Olaf')
    manager = await t.createUser('manager', 'Mira')
    employee = await t.createUser('employee', 'Erik')
  })

  it('follows the role until someone is switched', async () => {
    expect(await names()).toEqual(['Mira', 'Olaf'])
    await flip(owner, manager, false)
    await flip(owner, employee, true)
    expect(await names()).toEqual(['Erik', 'Olaf'])
  })

  it('leaves a closed week alone', async () => {
    await t.as(owner, () => t.db.query(`select merchant.close_partner_week('2026-09-28')`))
    await flip(owner, manager, true)
    expect(await names()).toEqual(['Erik', 'Olaf'])
  })

  it('is for the Owner only', async () => {
    await expect(flip(manager, manager, true)).rejects.toThrow(/Not allowed/)
  })
})
