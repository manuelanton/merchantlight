import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type TestDb } from './harness'

describe('categories', () => {
  let t: TestDb
  let manager: Awaited<ReturnType<TestDb['createUser']>>
  let employee: Awaited<ReturnType<TestDb['createUser']>>

  const idOf = async (name: string) =>
    (await t.one<{ id: string }>(`select id from merchant.categories where name = $1`, [name])).id

  beforeAll(async () => {
    t = await createDb()
    manager = await t.createUser('manager', 'Mira')
    employee = await t.createUser('employee', 'Erik')
  })
  afterAll(() => t.db.close())

  it('starts with the store sections and Raw Materials', async () => {
    const names = (await t.rows<{ name: string }>(`select name from merchant.categories`)).map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['Clothes', 'Weapons', 'Raw Materials', 'Other']))
  })

  it('puts new materials in Raw Materials', async () => {
    await t.as(manager, () => t.db.query(`insert into merchant.materials (name, buy_price) values ('Flax', 1)`))
    expect(await t.one(`select category from merchant.materials where name = 'Flax'`)).toEqual({ category: 'Raw Materials' })
  })

  it('refuses an item in a category that does not exist', async () => {
    await expect(t.as(manager, () => t.db.query(`insert into merchant.goods (name, category, sell_price) values ('Odd', 'Made Up', 1)`)))
      .rejects.toThrow(/category_fk/)
  })

  it('adds a category once, whatever the spelling', async () => {
    await t.as(manager, () => t.db.query(`select merchant.add_category('  Tools ')`))
    expect(await t.one(`select name, slug from merchant.categories where slug = 'tools'`)).toEqual({ name: 'Tools', slug: 'tools' })
    await expect(t.as(manager, () => t.db.query(`select merchant.add_category('tools')`))).rejects.toThrow('already exists')
    await expect(t.as(manager, () => t.db.query(`select merchant.add_category('  ')`))).rejects.toThrow('Give the category a name')
  })

  it('leaves changes to managers', async () => {
    await expect(t.as(employee, () => t.db.query(`select merchant.add_category('Secret')`))).rejects.toThrow('Not allowed')
  })

  it('takes the items along when renaming and keeps the address', async () => {
    await t.as(manager, () => t.db.query(`insert into merchant.goods (name, category, sell_price) values ('Hammer', 'Tools', 5)`))
    const id = await idOf('Tools')
    await t.as(manager, () => t.db.query(`select merchant.rename_category($1, 'Hand Tools')`, [id]))
    expect(await t.one(`select category from merchant.goods where name = 'Hammer'`)).toEqual({ category: 'Hand Tools' })
    expect(await t.one(`select slug from merchant.categories where id = $1`, [id])).toEqual({ slug: 'tools' })
  })

  it('only removes a category nothing active is in', async () => {
    const id = await idOf('Hand Tools')
    await expect(t.as(manager, () => t.db.query(`select merchant.remove_category($1)`, [id]))).rejects.toThrow('Move the items out of Hand Tools first (1 left)')
    await t.db.exec(`update merchant.goods set active = false where name = 'Hammer'`)
    await t.as(manager, () => t.db.query(`select merchant.remove_category($1)`, [id]))
    expect(await t.one(`select category from merchant.goods where name = 'Hammer'`)).toEqual({ category: 'Other' })
  })

  it('keeps Raw Materials and Other', async () => {
    for (const name of ['Raw Materials', 'Other']) {
      const id = await idOf(name)
      await expect(t.as(manager, () => t.db.query(`select merchant.remove_category($1)`, [id]))).rejects.toThrow("can't be removed")
      await expect(t.as(manager, () => t.db.query(`select merchant.rename_category($1, 'Stuff')`, [id]))).rejects.toThrow("can't be renamed")
    }
  })
})
