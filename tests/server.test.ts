import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportSite } from '../src/core/exportZip.ts'
import { defaultRoom } from '../src/core/room.ts'
import type { Project } from '../src/core/schema.ts'
import { createApp } from '../server/index.ts'

const project = (slug: string, extra: Partial<Project> = {}): Project => ({
  schemaVersion: 1,
  site: { slug, title: 'Moon', tagline: '', theme: 'room', lang: 'en' },
  ghost: { enabled: true, name: 'Boo', color: 'white' },
  blocks: [],
  posts: [
    { id: 'p1', slug: 'public-one', title: 'Hello', body: 'hi', createdAt: '2026-01-01T00:00:00.000Z', visibility: 'public', imageIds: [] },
    { id: 'p2', slug: 'secret-one', title: 'TOPSECRETTITLE', body: 'TOPSECRETBODY', createdAt: '2026-01-02T00:00:00.000Z', visibility: 'private', imageIds: [] },
  ],
  links: [],
  webring: {},
  room: defaultRoom(),
  assets: [],
  recordings: [],
  ...extra,
})

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

describe('server', () => {
  let dir: string
  let base: string
  let close: () => Promise<void>

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'li-server-'))
    const app = createApp({ dataDir: dir })
    await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
    close = app.close
  })
  afterAll(async () => {
    await close()
    rmSync(dir, { recursive: true, force: true })
  })

  const put = (slug: string, key: string | null, body: Uint8Array | string) =>
    fetch(`${base}/api/sites/${slug}`, {
      method: 'PUT',
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/zip' },
      body: body as BodyInit,
    })

  it('publishes only what the export contains, and serves it at /@slug/', async () => {
    const r = await put('moon', KEY_A, exportSite(project('moon')))
    expect(r.status).toBe(200)
    const page = await fetch(`${base}/@moon/`)
    expect(page.status).toBe(200)
    expect(page.headers.get('x-content-type-options')).toBe('nosniff')
    const html = await page.text()
    expect(html).toContain('Hello')
    expect(html).not.toContain('TOPSECRET')
    expect((await fetch(`${base}/@moon/room.js`)).headers.get('content-type')).toContain('javascript')
    expect((await fetch(`${base}/@moon/posts/secret-one.html`)).status).toBe(404)
    expect((await fetch(`${base}/@moon`, { redirect: 'manual' })).status).toBe(301)
  })

  it('only the key holder can update a slug', async () => {
    expect((await put('moon', KEY_B, exportSite(project('moon')))).status).toBe(403)
    expect((await put('moon', null, exportSite(project('moon')))).status).toBe(401)
    expect((await put('moon', KEY_A, exportSite(project('moon')))).status).toBe(200)
  })

  it('refuses a ZIP for a different address, path tricks, scripts it should not host, and non-zips', async () => {
    expect((await put('other', KEY_A, exportSite(project('moon')))).status).toBe(400)
    const evil = (name: string) => zipSync({ 'index.html': strToU8('x'), 'site.json': strToU8('{"site":{"slug":"evil"}}'), [name]: strToU8('x') })
    for (const n of ['../x.html', '/abs.html', 'a\\b.html', '.hidden.html', 'run.php', 'a/../../b.html']) {
      const r = await put('evil', KEY_A, evil(n))
      expect(r.status, n).toBe(400)
    }
    expect((await put('evil', KEY_A, 'not a zip')).status).toBe(400)
    expect((await fetch(`${base}/@evil/`)).status).toBe(404)
  })

  it('refuses oversized uploads', async () => {
    const big = new Uint8Array(51 * 1024 * 1024)
    const r = await put('big', KEY_A, big).catch(() => null)
    expect(r === null || r.status === 413).toBe(true)
  })

  it('does not serve files outside a site folder', async () => {
    for (const p of ['/@moon/../li.db', '/@moon/%2e%2e/li.db', '/@moon/..%2fli.db']) {
      const r = await fetch(`${base}${p}`)
      expect([404, 400]).toContain(r.status)
    }
  })

  it('guestbook: messages are pending until the owner approves, and are plain text', async () => {
    const post = (body: unknown, ct = 'application/json') =>
      fetch(`${base}/api/sites/moon/messages`, { method: 'POST', headers: { 'Content-Type': ct }, body: JSON.stringify(body) })
    expect((await post({ name: '<b>Ana</b>', text: '<script>alert(1)</script> hi' })).status).toBe(201)
    expect((await post({ text: 'bot', website: 'http://spam' })).status).toBe(201) // silently dropped
    expect((await post({ text: '' })).status).toBe(400)
    expect((await post({ text: 'x' }, 'text/plain')).status).toBe(415)

    const publicList = await (await fetch(`${base}/api/sites/moon/messages/approved`)).json()
    expect(publicList.messages).toEqual([])

    expect((await fetch(`${base}/api/sites/moon/messages`)).status).toBe(403)
    expect((await fetch(`${base}/api/sites/moon/messages`, { headers: { Authorization: `Bearer ${KEY_B}` } })).status).toBe(403)
    const mine = await (await fetch(`${base}/api/sites/moon/messages`, { headers: { Authorization: `Bearer ${KEY_A}` } })).json()
    expect(mine.messages).toHaveLength(1)
    expect(mine.messages[0].text).toContain('<script>') // stored as text; the runtime shows it with textContent
    const id = mine.messages[0].id as string

    const act = (action: string, key = KEY_A) =>
      fetch(`${base}/api/sites/moon/messages/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    expect((await act('approve', KEY_B)).status).toBe(403)
    expect((await act('approve')).status).toBe(200)
    const after = await (await fetch(`${base}/api/sites/moon/messages/approved`)).json()
    expect(after.messages).toHaveLength(1)
    expect((await act('delete')).status).toBe(200)
    expect((await (await fetch(`${base}/api/sites/moon/messages/approved`)).json()).messages).toEqual([])
  })

  it('rate limits guestbook messages per visitor', async () => {
    const codes: number[] = []
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${base}/api/sites/moon/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `note ${i}` }),
      })
      codes.push(r.status)
    }
    expect(codes).toContain(429)
  })
})
