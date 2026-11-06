import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { accessFor, syncMember } from '@/lib/merchant-access'
import { BadRpcCall, buildRpcCall, rpcError } from '@/lib/merchant-rpc'
import { createDb, type TestDb } from './harness'

let t: TestDb

vi.mock('@/lib/merchant-db', () => ({
  asService: (text: string, params: unknown[] = []) => t.rows(text, params),
}))

const lookup = vi.hoisted(() => vi.fn())
vi.mock('@/lib/discord', async (original) => ({
  ...(await original<typeof import('@/lib/discord')>()),
  lookupMember: lookup,
}))

const MANAGER = '1568044567004061807'
const EMPLOYEE = '1568044679264731188'
const memberWith = (...roles: string[]) => ({ status: 'member', member: { roles, nick: 'Brynja', avatar: null, user: { id: 'u', username: 'brynja' } } })
const expire = (id: string) => t.db.query(`update merchant.profiles set last_synced_at = now() - interval '6 minutes' where discord_id = $1`, [id])

beforeAll(async () => { t = await createDb() })
beforeEach(() => { lookup.mockReset(); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

describe('role checks', () => {
  it('writes the Discord role at login', async () => {
    lookup.mockResolvedValue(memberWith(MANAGER))
    await syncMember('a1', 'oauth')
    expect(await t.one(`select role, display_name, in_guild, last_login_at is not null as logged_in from merchant.profiles where discord_id = 'a1'`))
      .toEqual({ role: 'manager', display_name: 'Brynja', in_guild: true, logged_in: true })
  })

  it('trusts a fresh role without asking Discord', async () => {
    lookup.mockClear()
    expect(await accessFor('a1')).toMatchObject({ role: 'manager', name: 'Brynja' })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('applies a demotion after five minutes, without a new login', async () => {
    await expire('a1')
    lookup.mockResolvedValue(memberWith(EMPLOYEE))
    expect((await accessFor('a1'))?.role).toBe('employee')
  })

  it('removes all rights when someone leaves the server', async () => {
    await expire('a1')
    lookup.mockResolvedValue({ status: 'not_member' })
    expect((await accessFor('a1'))?.role).toBe('visitor')
    expect(await t.one(`select in_guild, display_name from merchant.profiles where discord_id = 'a1'`))
      .toEqual({ in_guild: false, display_name: 'Brynja' })
  })

  it('keeps the last role while Discord gives no answer', async () => {
    lookup.mockResolvedValue(memberWith(MANAGER))
    await syncMember('a2', 'oauth')
    await expire('a2')
    lookup.mockResolvedValue({ status: 'unavailable', reason: 'discord 500' })
    expect((await accessFor('a2'))?.role).toBe('manager')
  })

  it('a bot re-check is not a login', async () => {
    const before = await t.one<{ last_login_at: Date }>(`select last_login_at from merchant.profiles where discord_id = 'a2'`)
    lookup.mockResolvedValue(memberWith(MANAGER))
    await syncMember('a2')
    expect(await t.one(`select last_login_at from merchant.profiles where discord_id = 'a2'`)).toEqual(before)
  })

  it('has no access for an unknown account Discord cannot confirm', async () => {
    lookup.mockResolvedValue({ status: 'unavailable', reason: 'discord 500' })
    expect(await accessFor('nobody')).toBeNull()
  })
})

describe('rpc calls', () => {
  it('rejects names that could carry SQL', () => {
    for (const name of ['craft(); drop table x; --', '_reserved', 'Craft', 'a b', 'merchant.craft', ''])
      expect(() => buildRpcCall(name, {})).toThrow(BadRpcCall)
    expect(() => buildRpcCall('craft', { 'p_x) or (1=1': 1 })).toThrow(BadRpcCall)
    expect(() => buildRpcCall('craft', { good: 1 })).toThrow(BadRpcCall)
  })

  const call = async <T,>(user: string, name: string, args: Record<string, unknown>) => {
    const { text, params } = buildRpcCall(name, args)
    return t.as(user, () => t.rows<T>(text, params))
  }

  it('passes jsonb lists and Postgres arrays correctly', async () => {
    const manager = await t.createUser('manager', 'Rpc Manager')
    const mat = await t.as(manager, () => t.one<{ id: string }>(`insert into merchant.materials (name, buy_price) values ('Wool', 2) returning id`))
    const good = await t.as(manager, () => t.one<{ id: string }>(`insert into merchant.goods (name, sell_price) values ('Scarf', 10) returning id`))
    await call(manager, 'create_purchase', { p_lines: [{ kind: 'material', item_id: mat.id, qty: 5, unit_price: 2 }], p_supplier: 'Rolf' })
    expect((await t.one<{ stock: number }>(`select stock from merchant.materials where id = $1`, [mat.id])).stock).toBe(5)
    await t.as(manager, () => t.db.query(`insert into merchant.recipe_components (good_id, material_id, quantity) values ($1, $2, 2)`, [good.id, mat.id]))
    await expect(call(manager, 'reprice_goods', { p_goods: [good.id], p_markup: 2 })).resolves.toBeDefined()
  })

  it('lets the database refuse what a role may not do', async () => {
    const employee = await t.createUser('employee', 'Rpc Employee')
    const err = await call(employee, 'create_purchase', { p_lines: [] }).catch((e) => e)
    expect(rpcError(err)).toMatchObject({ status: 403 })
    expect(rpcError(err).error).toMatch(/^Not allowed/)
  })

  it('refuses internal functions and hides unknown ones', async () => {
    const owner = await t.createUser('owner', 'Rpc Owner')
    const denied = await call(owner, 'upsert_discord_profile', { p_discord_id: 'x', p_username: 'x', p_display_name: 'x', p_avatar_url: 'x', p_role: 'owner', p_in_guild: true }).catch((e) => e)
    expect(rpcError(denied).status).toBe(403)
    const missing = await call(owner, 'no_such_function', {}).catch((e) => e)
    expect(rpcError(missing)).toEqual({ status: 404, error: 'Unknown function' })
  })
})
