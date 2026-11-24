// Task 8: the exported ZIP, unpacked onto disk and served by a plain static server
// from a domain root and from a sub-path, must have every reference resolve.
import { unzipSync } from 'fflate'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, normalize as normPath } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportSite } from '../src/core/exportZip.ts'
import { defaultRoom } from '../src/core/room.ts'
import { parseProject, type Project } from '../src/core/schema.ts'

const legacy = {
  schemaVersion: 1 as const,
  site: { slug: 'moon', title: 'Moon’s corner', tagline: 'Notes from the night shift', theme: 'midnight', lang: 'en' },
  ghost: { enabled: true, name: 'Boo', color: 'lilac' },
  assets: [{ id: 'sea', mime: 'image/png', data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) }],
  posts: [
    {
      id: 'p1',
      slug: 'first-day-at-the-sea',
      title: 'First day at the sea',
      body: 'Salt air.\n\nCold water, warm sand.',
      createdAt: '2026-11-20T09:30:00.000Z',
      visibility: 'public',
      imageIds: ['sea'],
    },
  ],
  blocks: [
    { id: 'b1', x: 0, y: 0, w: 2, h: 2, content: { kind: 'post', postId: 'p1' } },
    { id: 'b2', x: 2, y: 0, w: 2, h: 1, content: { kind: 'links' } },
    { id: 'b3', x: 2, y: 1, w: 1, h: 1, content: { kind: 'ghost-home' } },
    { id: 'b4', x: 0, y: 2, w: 4, h: 1, content: { kind: 'image', assetId: 'sea' } },
    { id: 'b5', x: 0, y: 3, w: 4, h: 2, content: { kind: 'voice' } },
  ],
  recordings: [
    { id: 'hello', title: 'Hello, visitor', createdAt: '2026-11-21T08:00:00.000Z', visibility: 'public', durationMs: 4200, mime: 'audio/ogg', data: new Uint8Array([79, 103, 103, 83]), openOn: '2030-01-01' },
    { id: 'secret', title: 'For later', createdAt: '2026-11-22T08:00:00.000Z', visibility: 'private', durationMs: 3000, mime: 'audio/webm', data: new Uint8Array([26, 69, 223, 163]) },
  ],
  links: [{ id: 'l1', title: 'A friend', url: 'https://friend.example/' }],
  webring: { next: 'https://ring.example/next' },
  room: defaultRoom(),
}

// The fixture is a v1 save; exports always run on the migrated (v2) project.
const parsed = parseProject(legacy)
if (!parsed.ok) throw new Error(parsed.reason)
const project: Project = parsed.value

let root: string
let server: Server
let origin: string

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'li-export-'))
  const entries = unzipSync(exportSite(project))
  for (const prefix of ['', '@moon']) {
    for (const [name, data] of Object.entries(entries)) {
      const file = join(root, prefix, name)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, data)
    }
  }
  // A deliberately dumb static server: files only, no rewrites, no index fallback.
  server = createServer((req, res) => {
    const path = normPath(decodeURIComponent(new URL(req.url!, 'http://x').pathname))
    try {
      res.writeHead(200).end(readFileSync(join(root, path)))
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  origin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(() => {
  server?.close()
  if (root) rmSync(root, { recursive: true, force: true })
})

async function crawl(start: string) {
  const seen = new Set<string>()
  const queue = [start]
  const external: string[] = []
  while (queue.length) {
    const url = queue.shift()!
    if (seen.has(url)) continue
    seen.add(url)
    const res = await fetch(url)
    expect(res.status, url).toBe(200)
    if (!url.endsWith('.html')) continue
    const doc = new JSDOM(await res.text()).window.document
    const refs = [...doc.querySelectorAll('[href],[src]')].map((el) => el.getAttribute('href') ?? el.getAttribute('src')!)
    const ghost = doc.getElementById('ghost-data')
    if (ghost) refs.push(...JSON.parse(ghost.textContent!).guide.map((g: { href: string }) => g.href))
    for (const ref of refs) {
      const abs = new URL(ref, url)
      abs.hash = ''
      if (abs.origin === origin) queue.push(abs.href)
      else external.push(abs.href)
    }
  }
  return { pages: seen, external }
}

describe('exported site runs on a plain static host', () => {
  it.each([['domain root', '/'], ['sub-path', '/@moon/']])('from the %s', async (_label, base) => {
    const { pages, external } = await crawl(`${origin}${base}index.html`)
    const local = [...pages].map((u) => u.slice(origin.length + base.length)).sort()
    expect(local).toEqual([
      'assets/sea.png',
      'audio/hello.ogg',
      'feed.xml',
      'ghost.js',
      'index.html',
      'posts/first-day-at-the-sea.html',
      'room.js',
      'site.js',
      'style.css',
    ])
    expect([...new Set(external)].sort()).toEqual(['https://friend.example/', 'https://ring.example/next'])
  })
})
