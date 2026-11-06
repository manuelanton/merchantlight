import { beforeAll, describe, expect, it, vi } from 'vitest'
import { asUser } from '@/lib/merchant-db'
import {
  addDays, getSale, isLow, listGoods, listMaterials, listPurchases, listSales, listUnits, partnerBalances, partnerWeek,
  rentalHistory, rentalSpace, todaysSales, treasuryBalance, treasuryCategories, treasuryEntries, weekStart,
} from '@/lib/store-data'
import { createDb, type TestDb } from './harness'

let t: TestDb
let manager: string, employee: string, other: string, rope: string

vi.mock('@/db', () => ({ getPglite: async () => t.db }))

const receipt = (who: string, lines: unknown[], post = true, seller = who) =>
  asUser<{ id: string; status: string }>(
    who,
    `select id, status from merchant.create_receipt($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [seller, 'Lydia', 2, 1, '', JSON.stringify(lines), post],
  )

beforeAll(async () => {
  t = await createDb()
  await t.db.exec(`update merchant.settings set employee_profit_share = 0, profit_split_from = '-infinity'`)
  manager = await t.createUser('manager', 'Mira')
  employee = await t.createUser('employee', 'Erik')
  other = await t.createUser('employee', 'Olga')
  const [good] = await asUser<{ id: string }>(
    manager,
    `insert into merchant.goods (name, category, sell_price, buy_price, min_stock) values ('Rope', 'Tools', 10, 4, 5) returning id`,
  )
  rope = good.id
})

describe('create_receipt', () => {
  it('posts a receipt with its lines in one call', async () => {
    const [sale] = await receipt(employee, [{ good_id: rope, qty: 3, unit_price: 10 }])
    expect(sale.status).toBe('posted')
    const found = await getSale(employee, sale.id)
    expect(found?.sale).toMatchObject({ total: 28, profit: 16, items: 3, seller: 'Erik', customer: 'Lydia', tip: 1 })
    expect(found?.lines).toMatchObject([{ good_name: 'Rope', quantity: 3, unit_price: 10 }])
  })

  it('keeps a draft out of the books but shows its total', async () => {
    const before = await treasuryBalance(manager)
    const [sale] = await receipt(employee, [{ good_id: rope, qty: 1, unit_price: 10 }], false)
    expect(sale.status).toBe('draft')
    expect((await getSale(employee, sale.id))?.sale).toMatchObject({ total: 8, profit: null })
    expect(await treasuryBalance(manager)).toBe(before)
  })

  it('leaves nothing behind when a line is bad', async () => {
    const count = (await listSales(manager, {})).length
    await expect(receipt(employee, [{ good_id: rope, qty: 0, unit_price: 10 }])).rejects.toThrow()
    expect((await listSales(manager, {})).length).toBe(count)
  })

  it('refuses an empty receipt', async () => {
    await expect(receipt(employee, [])).rejects.toThrow(/at least one line/)
  })

  it('does not let an employee sell in someone else’s name', async () => {
    await expect(receipt(employee, [{ good_id: rope, qty: 1, unit_price: 10 }], true, other)).rejects.toThrow()
  })
})

describe('posted receipts, like the Tavern', () => {
  it('stay with the books: a seller keeps only their drafts', async () => {
    const [posted] = await receipt(employee, [{ good_id: rope, qty: 1, unit_price: 10 }])
    const [draft] = await receipt(employee, [{ good_id: rope, qty: 1, unit_price: 10 }], false)
    expect(await asUser(employee, `delete from merchant.sales where id = $1 returning id`, [posted.id])).toEqual([])
    await expect(asUser(employee, `select merchant.unpost_sale($1)`, [posted.id])).rejects.toThrow(/Not allowed/)
    expect(await asUser(employee, `delete from merchant.sales where id = $1 returning id`, [draft.id])).toHaveLength(1)
    expect(await asUser(manager, `select merchant.unpost_sale($1)`, [posted.id])).toHaveLength(1)
  })
})

describe('page reads', () => {
  it('shows employees only their own receipts', async () => {
    await receipt(other, [{ good_id: rope, qty: 1, unit_price: 10 }])
    const sellers = (await todaysSales(employee)).map((s) => s.seller)
    expect(new Set(sellers)).toEqual(new Set(['Erik']))
    expect(new Set((await todaysSales(manager)).map((s) => s.seller))).toEqual(new Set(['Erik', 'Olga']))
  })

  it('filters sales by status and search', async () => {
    expect((await listSales(manager, { status: 'draft' })).every((s) => s.status === 'draft')).toBe(true)
    expect((await listSales(manager, { q: 'olga' })).map((s) => s.seller)).toEqual(['Olga'])
    expect(await listSales(manager, { q: 'nobody' })).toEqual([])
  })

  it('flags low stock like the Tavern', async () => {
    const [good] = (await listGoods(employee)).filter((g) => g.name === 'Rope')
    expect(good.stock).toBeLessThan(0)
    expect(isLow(good)).toBe(true)
    expect(isLow({ ...good, min_stock: 0 })).toBe(false)
  })

  it('gives the payments page its figures', async () => {
    const week = await partnerWeek(manager, weekStart())
    expect(week.sales_profit).toBeGreaterThan(0)
    expect(week.partners.map((p) => p.name)).toEqual(['Mira'])
    expect(await partnerBalances(manager)).toEqual([])
  })

  it('offers only categories people may book by hand', async () => {
    const names = (await treasuryCategories(manager)).map((c) => c.name)
    expect(names).toContain('Rent')
    expect(names).not.toContain('Partner payout')
    expect((await treasuryEntries(manager, 'Partner payout'))).toEqual([])
  })
})

describe('purchases', () => {
  it('fills the shelf, takes the gold and shows in the history', async () => {
    const [material] = await asUser<{ id: string }>(manager, `insert into merchant.materials (name, buy_price) values ('Hemp', 2) returning id`)
    const before = await treasuryBalance(manager)
    const stock = (await listGoods(manager)).find((g) => g.id === rope)!.stock
    await asUser(manager, `select merchant.create_purchase($1::jsonb, $2, $3, $4)`, [
      JSON.stringify([{ kind: 'good', item_id: rope, qty: 4, unit_price: 5 }, { kind: 'material', item_id: material.id, qty: 10, unit_price: 2 }]),
      'Belethor', null, false,
    ])
    expect(await treasuryBalance(manager)).toBe(before - 40)
    expect((await listGoods(manager)).find((g) => g.id === rope)!.stock).toBe(stock + 4)
    expect((await listMaterials(manager)).map((m) => m.stock)).toEqual([10])
    const [purchase] = await listPurchases(manager)
    expect(purchase).toMatchObject({ supplier: 'Belethor', buyer: 'Mira', total: 40 })
    expect(purchase.summary).toContain('4× Rope')
  })
})

describe('rentals', () => {
  it('shows who rents what and books the income', async () => {
    const [unit] = await asUser<{ id: string }>(manager, `insert into merchant.storage_units (name, weekly_price, location) values ('Barrel 1', 60, 'Windhelm') returning id`)
    await asUser(manager, `insert into merchant.storage_units (name, kind, location) values ('Safe', 'internal', 'Windhelm')`)
    expect(await rentalSpace('Windhelm')).toEqual({ units: 1, free: 1 })
    await asUser(manager, `select merchant.create_rental($1, $2, $3)`, [unit.id, 'Lydia', 2])
    expect(await rentalSpace('Windhelm')).toEqual({ units: 1, free: 0 })
    const rows = await listUnits(employee)
    expect(rows.find((u) => u.name === 'Barrel 1')).toMatchObject({ renter: 'Lydia', rate: 60, days_left: 14, has_history: true })
    expect(rows.find((u) => u.name === 'Safe')).toMatchObject({ kind: 'internal', rental_id: null, has_history: false })
    expect(await rentalHistory(manager)).toMatchObject([{ unit: 'Barrel 1', renter: 'Lydia', paid: 120, ended: false }])
    expect((await treasuryEntries(manager, 'Rental income'))[0].money_in).toBe(120)
  })
})

describe('weeks', () => {
  it('start on Monday, also on a Sunday', () => {
    expect(weekStart(new Date('2026-11-08T23:00:00Z'))).toBe('2026-11-02')
    expect(weekStart(new Date('2026-11-09T00:00:00Z'))).toBe('2026-11-09')
    expect(addDays('2026-11-02', 7)).toBe('2026-11-09')
  })
})
