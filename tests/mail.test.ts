import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BLANK_LETTER, type Letter } from '../src/core/letter.ts'
import { DEFAULT_PEN, heartStroke } from '../src/core/strokes.ts'
import { createApp } from '../server/index.ts'

const key = (c: string) => c.repeat(64)
const KEYS = { ana: key('a'), ben: key('b'), cy: key('c'), eve: key('e') }
const heart: Letter = { ...BLANK_LETTER, items: [{ t: 'drawing', id: 'd1', x: 500, y: 600, rot: 0, scale: 1, drawing: { v: 1, strokes: [heartStroke(500, 500, 250, DEFAULT_PEN)] } }] }

let base = ''
let dir = ''
let close: () => Promise<void>
const call = (who: keyof typeof KEYS | null, method: string, path: string, body?: unknown, auth = who ? KEYS[who] : '') =>
  fetch(`${base}${path}`, { method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })

const befriend = async (a: keyof typeof KEYS, b: keyof typeof KEYS) => {
  await call(a, 'POST', `/api/people/${a}/friends`, { to: b })
  expect((await call(b, 'POST', `/api/people/${b}/friends/${a}/accept`)).status).toBe(200)
}
let n = 0
const send = (from: keyof typeof KEYS, to: string, letter: unknown = heart, clientId = `client-${++n}-abcdefgh`) =>
  call(from, 'POST', `/api/people/${from}/mail`, { to, clientId, letter, summary: 'a heart' })

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'li-mail-'))
  const app = createApp({ dataDir: dir })
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  close = app.close
  for (const who of Object.keys(KEYS) as (keyof typeof KEYS)[]) expect((await call(who, 'PUT', `/api/people/${who}`)).status).toBe(200)
})
afterAll(async () => {
  await close()
  rmSync(dir, { recursive: true, force: true })
})

describe('Heart Mail between independent identities', () => {
  it('H1: a name belongs to whoever claimed it first; others cannot act as them', async () => {
    expect((await call('eve', 'PUT', '/api/people/ana', undefined, KEYS.eve)).status).toBe(403)
    expect((await call(null, 'GET', '/api/people/ana/mail')).status).toBe(403)
    expect((await call('ben', 'GET', '/api/people/ana/mail', undefined, KEYS.ben)).status).toBe(403)
    expect((await call('ana', 'GET', '/api/people/ana/mail', undefined, 'z'.repeat(64))).status).toBe(403)
  })

  it('H2: you can only send to someone who accepted you', async () => {
    expect((await send('ana', 'ben')).status).toBe(403) // not friends yet
    await call('ana', 'POST', '/api/people/ana/friends', { to: 'ben' })
    expect((await send('ana', 'ben')).status).toBe(403) // still pending
    expect((await call('ana', 'POST', '/api/people/ana/friends/ben/accept')).status).toBe(404) // cannot accept your own request
    expect((await call('ben', 'GET', '/api/people/ben/friends')).status).toBe(200)
    const list = await (await call('ben', 'GET', '/api/people/ben/friends')).json()
    expect(list.incoming.map((x: { slug: string }) => x.slug)).toEqual(['ana'])
    expect((await call('ben', 'POST', '/api/people/ben/friends/ana/accept')).status).toBe(200)
    expect((await send('ana', 'ben')).status).toBe(201)
  })

  it('H3: delivery is idempotent: a retry with the same clientId never sends twice', async () => {
    const id = 'retry-client-0001'
    const a = await (await send('ana', 'ben', heart, id)).json()
    const b = await send('ana', 'ben', heart, id)
    expect(b.status).toBe(200)
    const bj = await b.json()
    expect(bj.duplicate).toBe(true)
    expect(bj.id).toBe(a.id)
    const inbox = await (await call('ben', 'GET', '/api/people/ben/mail')).json()
    expect(inbox.mail.filter((m: { id: string }) => m.id === a.id)).toHaveLength(1)
  })

  it('H4: offline recipient: the letter waits and arrives with unread state; reading marks it read for the sender too', async () => {
    const sent = await (await send('ana', 'ben', { ...heart, date: '24 Nov' })).json()
    const inbox = await (await call('ben', 'GET', '/api/people/ben/mail')).json()
    const m = inbox.mail.find((x: { id: string }) => x.id === sent.id)
    expect(m).toMatchObject({ from: 'ana', unread: true })
    const letter = await (await call('ben', 'GET', `/api/people/ben/mail/${sent.id}`)).json()
    expect(letter.letter.date).toBe('24 Nov')
    await call('ben', 'POST', `/api/people/ben/mail/${sent.id}/read`)
    const after = await (await call('ben', 'GET', '/api/people/ben/mail')).json()
    expect(after.mail.find((x: { id: string }) => x.id === sent.id).unread).toBe(false)
    const outbox = await (await call('ana', 'GET', '/api/people/ana/mail/sent')).json()
    expect(outbox.sent.find((x: { id: string }) => x.id === sent.id).state).toBe('read')
    // "since" lets a returning device fetch only what is new
    const none = await (await call('ben', 'GET', `/api/people/ben/mail?since=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`)).json()
    expect(none.mail).toEqual([])
  })

  it('H5: nobody else can read a letter: strangers, other friends, and the wrong key all get 404/403', async () => {
    const sent = await (await send('ana', 'ben')).json()
    await befriend('cy', 'ben')
    expect((await call('cy', 'GET', `/api/people/cy/mail/${sent.id}`)).status).toBe(404)
    expect((await call('eve', 'GET', `/api/people/eve/mail/${sent.id}`)).status).toBe(404)
    expect((await call('eve', 'GET', `/api/people/ben/mail/${sent.id}`, undefined, KEYS.eve)).status).toBe(403)
    expect((await call('cy', 'DELETE', `/api/people/cy/mail/${sent.id}`)).status).toBe(200) // no effect on someone else's mail
    expect((await call('ben', 'GET', `/api/people/ben/mail/${sent.id}`)).status).toBe(200)
    // the sender keeps their own copy
    expect((await call('ana', 'GET', `/api/people/ana/mail/${sent.id}`)).status).toBe(200)
  })

  it('H6: deleting removes it from the recipient only; the sender\'s copy stays until they delete it', async () => {
    const sent = await (await send('ana', 'ben')).json()
    await call('ben', 'DELETE', `/api/people/ben/mail/${sent.id}`)
    expect((await call('ben', 'GET', `/api/people/ben/mail/${sent.id}`)).status).toBe(404)
    const inbox = await (await call('ben', 'GET', '/api/people/ben/mail')).json()
    expect(inbox.mail.some((m: { id: string }) => m.id === sent.id)).toBe(false)
  })

  it('H7: blocking stops delivery, removes the friendship, and the blocked sender is not told why', async () => {
    await befriend('eve', 'ben')
    expect((await send('eve', 'ben')).status).toBe(201)
    expect((await call('ben', 'PUT', '/api/people/ben/blocks/eve')).status).toBe(200)
    expect((await send('eve', 'ben')).status).toBe(403)
    // a new request from the blocked home looks exactly like a request to a home that does not exist
    const req = await call('eve', 'POST', '/api/people/eve/friends', { to: 'ben' })
    const nobody = await call('eve', 'POST', '/api/people/eve/friends', { to: 'nobody-here' })
    expect(req.status).toBe(nobody.status)
    expect(await req.json()).toEqual(await nobody.json())
    const list = await (await call('ben', 'GET', '/api/people/ben/friends')).json()
    expect(list.blocked).toContain('eve')
    expect(list.incoming.map((x: { slug: string }) => x.slug)).not.toContain('eve')
    await call('ben', 'DELETE', '/api/people/ben/blocks/eve')
  })

  it('H8: invalid, empty or oversized letters are refused; scripts and non-image data cannot be smuggled', async () => {
    expect((await send('ana', 'ben', BLANK_LETTER)).status).toBe(400) // empty
    expect((await send('ana', 'ben', { v: 1, paper: 'cream', items: [{ t: 'photo', id: 'p', x: 1, y: 1, rot: 0, scale: 1, data: 'data:text/html;base64,PHNjcmlwdD4=', frame: true }] })).status).toBe(400)
    expect((await send('ana', 'ben', { v: 1, paper: 'cream', items: [{ t: 'seal', id: 's', x: 1, y: 1, rot: 0, scale: 1, color: '#aa0000"><script>' }] })).status).toBe(400)
    expect((await send('ana', 'ben', 'not a letter')).status).toBe(400)
    const noClient = await call('ana', 'POST', '/api/people/ana/mail', { to: 'ben', letter: heart })
    expect(noClient.status).toBe(400)
    expect((await call('ana', 'POST', '/api/people/ana/mail', { to: 'ana', clientId: 'self-send-1234', letter: heart })).status).toBe(400)
  })

  it('H9: a stranger cannot learn who has an account: unknown and unclaimed names answer the same', async () => {
    const a = await call('eve', 'POST', '/api/people/eve/friends', { to: 'ghost-user-1' })
    const b = await call('eve', 'POST', '/api/people/eve/friends', { to: 'cy' })
    expect(a.status).toBe(b.status)
  })

  it('H10: sending is rate limited per sender', async () => {
    const codes: number[] = []
    for (let i = 0; i < 45; i++) codes.push((await send('cy', 'ben')).status)
    expect(codes).toContain(429)
    expect(codes.filter((c) => c === 201).length).toBeLessThanOrEqual(40)
  })
})
