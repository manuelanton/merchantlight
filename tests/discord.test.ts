import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOwnerAccount, lookupMember, mapRole } from '@/lib/discord'

const OWNER_ROLE = '1568052942840402081'
const MANAGER = '1568044567004061807'
const EMPLOYEE = '1568044679264731188'
const VISITOR = '1568044763762917458'
const OWNER = '146826443924439040'

describe('mapRole', () => {
  it('maps server roles, highest privilege first', () => {
    expect(mapRole([VISITOR, MANAGER, OWNER_ROLE], 'x')).toBe('owner')
    expect(mapRole([VISITOR, EMPLOYEE, MANAGER], 'x')).toBe('manager')
    expect(mapRole([EMPLOYEE, VISITOR], 'x')).toBe('employee')
    expect(mapRole([VISITOR], 'x')).toBe('visitor')
  })

  it('gives everyone else no rights', () => {
    expect(mapRole([], 'x')).toBe('visitor')
    expect(mapRole(['999'], 'x')).toBe('visitor')
  })

  it('keeps the owner account as owner, even outside the server', () => {
    expect(mapRole([], OWNER)).toBe('owner')
  })

  it('lets SUPERADMIN_DISCORD_ID replace the owner account', () => {
    vi.stubEnv('SUPERADMIN_DISCORD_ID', 'other')
    expect(isOwnerAccount('other')).toBe(true)
    expect(isOwnerAccount(OWNER)).toBe(false)
    vi.unstubAllEnvs()
  })
})

describe('lookupMember', () => {
  const fetchMock = vi.fn()
  const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DISCORD_BOT_TOKEN', 'bot-token')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const auth = (call: number) => fetchMock.mock.calls[call][1].headers.Authorization

  it('uses the login token first', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { roles: [MANAGER] }))
    expect((await lookupMember('1', 'oauth')).status).toBe('member')
    expect(auth(0)).toBe('Bearer oauth')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the bot when the login token is rejected', async () => {
    fetchMock.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, { roles: [EMPLOYEE] }))
    expect((await lookupMember('1', 'expired')).status).toBe('member')
    expect(auth(1)).toBe('Bot bot-token')
  })

  it('treats 404 as not in the server', async () => {
    fetchMock.mockResolvedValueOnce(reply(404))
    expect(await lookupMember('1')).toEqual({ status: 'not_member' })
  })

  it('never reads a Discord failure as losing membership', async () => {
    fetchMock.mockResolvedValueOnce(reply(500))
    expect((await lookupMember('1')).status).toBe('unavailable')
  })

  it('reports no answer without a bot token', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    expect((await lookupMember('1')).status).toBe('unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
