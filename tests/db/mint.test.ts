import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

describe('minting', () => {
  let t: TestDb
  let manager: string, employee: string, gold: string, iron: string
  const WEEK = '2026-10-05' // a Monday

  const stock = async (id: string) => (await t.one<{ stock: number }>(`select stock from merchant.materials where id = $1`, [id])).stock
  const mint = (user: string, material: string, qty: number, rate: number | null = null, date: string | null = null) =>
    t.as(user, () => t.one<{ id: string; amount: number; cost_total: number }>(
      `select id, amount, cost_total from merchant.mint($1, $2, $3, '', $4)`, [material, qty, rate, date]))
  const minting = async () =>
    (await t.rows<{ money_in: number }>(`select money_in from merchant.treasury_entries where category = 'Minting'`)).reduce((s, r) => s + r.money_in, 0)

  beforeAll(async () => {
    t = await createDb()
    await t.db.exec(`update merchant.settings set employee_profit_share = 0, profit_split_from = '-infinity'`)
    manager = await t.createUser('manager', 'Mira')
    employee = await t.createUser('employee', 'Erik')
    gold = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price, stock, mint_rate) values ('Gold Ingot', 18, 10, 30) returning id`)).id
    iron = (await t.one<{ id: string }>(`insert into merchant.materials (name, buy_price, stock) values ('Iron Ingot', 7, 10) returning id`)).id
  })

  it('turns ingots into septims at the usual rate', async () => {
    const m = await mint(employee, gold, 4)
    expect(m).toMatchObject({ amount: 120, cost_total: 72 })
    expect(await stock(gold)).toBe(6)
    expect(await minting()).toBe(120)
    expect(await t.one(`select reason from merchant.stock_movements where ref_type = 'mint' and ref_id = $1`, [m.id])).toEqual({ reason: 'Mint' })
  })

  it('takes another rate when the mint pays differently', async () => {
    expect((await mint(employee, gold, 1, 32)).amount).toBe(32)
  })

  it('only mints whole ingots that can be minted', async () => {
    await expect(mint(employee, iron, 1)).rejects.toThrow('Only Gold and Silver Ingots can be minted')
    await expect(mint(employee, gold, 1.5)).rejects.toThrow('whole number')
    await expect(mint(employee, gold, 0)).rejects.toThrow('whole number')
  })

  it('is not a sale', async () => {
    expect(await t.one(`select count(*)::int as n from merchant.sales`)).toEqual({ n: 0 })
  })

  it('counts as sales income in the partner split', async () => {
    await mint(manager, gold, 2, null, `${WEEK} 12:00+00`)
    const f = await t.one(`select * from merchant._partner_figures($1)`, [WEEK])
    expect(f).toEqual({ sales_income: 60, other_income: 0, expenses: 0, net: 60 })
  })

  it('lets only Managers date one back', async () => {
    await expect(mint(employee, gold, 1, null, `${WEEK} 12:00+00`)).rejects.toThrow('Only Managers')
  })

  it('puts everything back when deleted', async () => {
    const before = await stock(gold)
    const m = await mint(employee, gold, 3)
    await t.as(employee, () => t.db.query(`select merchant.delete_mint($1)`, [m.id]))
    expect(await stock(gold)).toBe(before)
    expect(await t.one(`select count(*)::int as n from merchant.treasury_entries where ref_id = $1`, [m.id])).toEqual({ n: 0 })
  })

  it("leaves other people's mintings to Managers", async () => {
    const m = await mint(manager, gold, 1)
    await expect(t.as(employee, () => t.db.query(`select merchant.delete_mint($1)`, [m.id]))).rejects.toThrow(/Not allowed/)
    await t.as(manager, () => t.db.query(`select merchant.delete_mint($1)`, [m.id]))
  })
})
