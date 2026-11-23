import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SiteStore } from '../server/store.mjs'
import { createPublishServer } from '../server/server.mjs'
import { generateSite } from '../src/core/generate.ts'
import { exportSite } from '../src/core/exportZip.ts'
import { unzipSync } from 'fflate'
import { decodePublishEnvelope, validateUsername, PUBLISH_LIMITS } from '../src/core/publish.ts'
import { envelopeFor, fixtureProject, makeToken } from './publish-fixture.ts'

type Server = ReturnType<typeof createPublishServer>

let dataDir: string
let store: SiteStore
let server: Server
let base: string
const SALT = 'test-only-salt-' + 'x'.repeat(40)

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'li-publish-'))
  store = new SiteStore(dataDir, SALT)
  await store.init()
  server = createPublishServer({ store, baseUrl: 'https://little.quinnverse.tech', rateLimit: 1000, tokenSalt: SALT })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  await rm(dataDir, { recursive: true, force: true })
})

function post(path: string, body: unknown, token?: string) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-site-token': token } : {}) },
    body: JSON.stringify(body),
  })
}
function del(path: string, token?: string) {
  return fetch(`${base}${path}`, { method: 'DELETE', headers: token ? { 'x-site-token': token } : {} })
}

describe('publish service — happy path', () => {
  const token = makeToken()

  it('health check returns ok', async () => {
    const r = await fetch(`${base}/healthz`)
    expect(r.status).toBe(200)
    expect((await r.json()).status).toBe('ok')
  })

  it('first publish returns 201 with a stable URL', async () => {
    const r = await post('/api/v1/publish', envelopeFor('alice'), token)
    expect(r.status).toBe(201)
    const body = await r.json()
    expect(body.status).toBe('created')
    expect(body.url).toBe('https://little.quinnverse.tech/@alice/')
  })

  it('published site is served and hides private content', async () => {
    const r = await fetch(`${base}/@alice/`)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toContain('no-store')
    const html = await r.text()
    expect(html).toContain('Hello visitors')
    expect(html).not.toContain('PRIVATE-TITLE-MARK')
    expect(html).not.toContain('PRIVATE-BODY-MARK')
  })

  it('private media paths 404 and are never in the public dir', async () => {
    expect((await fetch(`${base}/@alice/assets/privphoto.png`)).status).toBe(404)
    expect((await fetch(`${base}/@alice/audio/privrec.webm`)).status).toBe(404)
  })

  it('feed.xml excludes private posts', async () => {
    const xml = await (await fetch(`${base}/@alice/feed.xml`)).text()
    expect(xml).toContain('Hello visitors')
    expect(xml).not.toContain('PRIVATE-TITLE-MARK')
  })

  it('site.json contains no credential and no private data', async () => {
    const txt = await (await fetch(`${base}/@alice/site.json`)).text()
    expect(txt).not.toContain(token)
    expect(txt).not.toContain('PRIVATE-TITLE-MARK')
    expect(txt).not.toContain('tokenHash')
  })

  it('update with correct token returns 200 and replaces content', async () => {
    const p = fixtureProject('alice')
    p.site.title = 'Updated corner'
    const r = await post('/api/v1/publish', envelopeFor('alice', p), token)
    expect(r.status).toBe(200)
    expect((await r.json()).status).toBe('updated')
    expect(await (await fetch(`${base}/@alice/`)).text()).toContain('Updated corner')
  })

  it('unpublish returns 200 and origin returns 410 afterwards', async () => {
    const r = await del('/api/v1/publish/alice', token)
    expect(r.status).toBe(200)
    const after = await fetch(`${base}/@alice/`)
    expect(after.status).toBe(410)
    expect(await after.text()).toContain('unpublished')
  })
})

describe('publish service — authorization & conflicts', () => {
  it('unauthorized update of an existing site returns 403', async () => {
    await post('/api/v1/publish', envelopeFor('bob'), makeToken())
    const r = await post('/api/v1/publish', envelopeFor('bob'), makeToken())
    expect(r.status).toBe(403)
  })

  it('unauthorized unpublish returns 403 and site survives', async () => {
    const r = await del('/api/v1/publish/bob', makeToken())
    expect(r.status).toBe(403)
    expect((await fetch(`${base}/@bob/`)).status).toBe(200)
  })

  it('unpublish without token returns 400', async () => {
    expect((await del('/api/v1/publish/bob')).status).toBe(400)
  })

  it('unpublish of a missing site returns 404', async () => {
    expect((await del('/api/v1/publish/ghostuser', makeToken())).status).toBe(404)
  })

  it('publish without a token header returns 400', async () => {
    expect((await post('/api/v1/publish', envelopeFor('notoken'))).status).toBe(400)
  })
})

describe('publish service — input validation & attacks', () => {
  it('rejects reserved and malformed usernames at the API', async () => {
    for (const name of ['admin', 'Bad_Name', 'a', '../etc', 'x'.repeat(40)]) {
      expect(validateUsername(name).ok).toBe(false)
      const r = await post('/api/v1/publish', envelopeFor('valid'), makeToken()).catch(() => null)
      void r
    }
    // Directly through validation path: reserved name envelope must be rejected.
    const env = envelopeFor('valid')
    env.username = 'admin'
    expect((await post('/api/v1/publish', env, makeToken())).status).toBe(400)
  })

  it('rejects a missing media file (tampered envelope)', async () => {
    const env = envelopeFor('carol')
    delete env.media['assets/pubphoto.png']
    expect((await post('/api/v1/publish', env, makeToken())).status).toBe(400)
  })

  it('rejects a smuggled extra media key with unsafe path', async () => {
    const env = envelopeFor('dave')
    env.media['../../evil'] = 'AAAA'
    expect((await post('/api/v1/publish', env, makeToken())).status).toBe(400)
  })

  it('rejects malicious javascript: URL in links', async () => {
    const p = fixtureProject()
    p.links = [{ id: 'l1', title: 'click', url: 'javascript:alert(1)' }]
    // Schema requires canonical http(s); build envelope then tamper the URL.
    const env = envelopeFor('erin', p)
    env.project.links = [{ id: 'l1', title: 'click', url: 'javascript:alert(1)' }]
    expect((await post('/api/v1/publish', env, makeToken())).status).toBe(400)
  })

  it('rejects XSS payload in post title (stored encoded, never executable)', async () => {
    const p = fixtureProject()
    p.posts[0]!.title = '<script>alert(1)</script>'
    const env = envelopeFor('frank', p)
    const r = await post('/api/v1/publish', env, makeToken())
    expect(r.status).toBe(201)
    const html = await (await fetch(`${base}/@frank/`)).text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('rejects an oversized request body with 413', async () => {
    const r = await fetch(`${base}/api/v1/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-token': makeToken() },
      body: 'x'.repeat(PUBLISH_LIMITS.maxRequestBytes + 10),
    })
    expect(r.status).toBe(413)
  })

  it('rejects unknown top-level keys (strict envelope)', () => {
    const env = envelopeFor('grace') as Record<string, unknown>
    env.evil = true
    expect(decodePublishEnvelope(env).ok).toBe(false)
  })

  it('path traversal in served file returns 404', async () => {
    await post('/api/v1/publish', envelopeFor('heidi'), makeToken())
    expect((await fetch(`${base}/@heidi/../../etc/passwd`)).status).toBe(404)
    expect((await fetch(`${base}/@heidi/%2e%2e%2fmeta%2fheidi.json`)).status).toBe(404)
  })
})

describe('publish artifact matches static export', () => {
  it('generateSite output equals the ZIP exported by exportSite', () => {
    const p = fixtureProject('ivan')
    const gen = generateSite(p, { baseUrl: 'https://little.quinnverse.tech/@ivan/' })
    const zip = unzipSync(exportSite(p, { baseUrl: 'https://little.quinnverse.tech/@ivan/' }))
    expect([...gen.keys()].sort()).toEqual(Object.keys(zip).sort())
    for (const [path, bytes] of gen) {
      expect(Buffer.from(zip[path]!)).toEqual(Buffer.from(bytes))
    }
  })

  it('generated artifact never contains private markers or credentials', () => {
    const files = generateSite(fixtureProject('judy'))
    const all = [...files.entries()]
      .filter(([n]) => !n.endsWith('.png'))
      .map(([, b]) => new TextDecoder().decode(b))
      .join('\n')
    expect(all).not.toContain('PRIVATE-TITLE-MARK')
    expect(all).not.toContain('PRIVATE-BODY-MARK')
    expect(all).not.toContain('PRIVATE-REC-MARK')
    expect(all).not.toContain('PRIVATE-PHOTO-BYTES')
    expect(all).not.toContain('PRIVATE-AUDIO')
    expect([...files.keys()]).not.toContain('assets/privphoto.png')
    expect([...files.keys()]).not.toContain('audio/privrec.webm')
  })
})
