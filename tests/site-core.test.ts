import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../src/core/backup.ts'
import { escapeHtml, jsonForScript } from '../src/core/escape.ts'
import { exportSite, importSite } from '../src/core/exportZip.ts'
import { generateSite } from '../src/core/generate.ts'
import { defaultRoom } from '../src/core/room.ts'
import { parseProject, type Project } from '../src/core/schema.ts'
import { parseVideoUrl } from '../src/core/video.ts'

/** A schemaVersion 1 save (block grid + theme), as written by the first releases. */
function legacySample() {
  return {
    schemaVersion: 1 as const,
    site: { slug: 'moon', title: 'Moon’s corner', tagline: 'Notes from the night shift', theme: 'midnight', lang: 'en' },
    ghost: { enabled: true, name: 'Boo', color: 'lilac' },
    assets: [
      { id: 'sea', mime: 'image/png', data: new Uint8Array([137, 80, 78, 71]) },
      { id: 'secret', mime: 'image/jpeg', data: new Uint8Array([255, 216, 255]) },
    ],
    posts: [
      {
        id: 'p1',
        slug: 'first-day-at-the-sea',
        title: 'First day at the sea',
        body: 'Salt air.\n\nCold water, warm sand.',
        createdAt: '2026-11-20T09:30:00.000Z',
        visibility: 'public',
        imageIds: ['sea'],
        video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ' },
      },
      {
        id: 'p2',
        slug: 'draft',
        title: 'Unsent letter',
        body: 'Not for anyone yet.',
        createdAt: '2026-11-21T09:30:00.000Z',
        visibility: 'private',
        imageIds: ['secret'],
      },
    ],
    blocks: [
      { id: 'b1', x: 0, y: 0, w: 2, h: 2, content: { kind: 'post', postId: 'p1' } },
      { id: 'b2', x: 2, y: 0, w: 2, h: 1, content: { kind: 'links' } },
      { id: 'b3', x: 2, y: 1, w: 1, h: 1, content: { kind: 'ghost-home' } },
      { id: 'b4', x: 0, y: 2, w: 4, h: 1, content: { kind: 'post', postId: 'p2' } },
    ],
    links: [{ id: 'l1', title: 'A friend', url: 'https://friend.example/' }],
    webring: { prev: 'https://ring.example/prev', next: 'https://ring.example/next' },
    room: defaultRoom(),
    recordings: [],
  }
}

/** The same home after migration to schemaVersion 2 (Web Atelier design). */
function sample(): Project {
  const r = parseProject(legacySample())
  if (!r.ok) throw new Error(r.reason)
  return r.value
}

const dec = new TextDecoder()

describe('escaping', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('JSON for script cannot close the script element', () => {
    const out = jsonForScript({ s: '</script><!-- \u2028' })
    expect(out).not.toMatch(/<|>|\u2028/)
    expect(JSON.parse(out)).toEqual({ s: '</script><!-- \u2028' })
  })
})

describe('validation', () => {
  it('accepts the sample project', () => {
    expect(parseProject(sample()).ok).toBe(true)
  })

  it.each([
    ['javascript: link', (p: Project) => (p.links[0]!.url = 'javascript:alert(1)')],
    ['credentials in link', (p: Project) => (p.links[0]!.url = 'https://user:pw@friend.example/')],
    ['non-canonical link', (p: Project) => (p.links[0]!.url = 'HTTPS://friend.example')],
    ['widget on a missing page', (p: Project) => (p.web.draft.widgets[0]!.pageId = 'nowhere')],
    ['duplicate widget id', (p: Project) => (p.web.draft.widgets[1]!.id = p.web.draft.widgets[0]!.id)],
    ['diary widget pointing to a missing entry', (p: Project) => {
      const w = p.web.draft.widgets.find((x) => x.content.type === 'diary')!
      if (w.content.type === 'diary') w.content.postIds = ['ghost-post']
    }],
    ['CSS injection in a colour', (p: Project) => (p.web.draft.tokens.bg = 'red;}</style><script>')],
    ['unknown font', (p: Project) => ((p.web.draft.tokens as { bodyFont: string }).bodyFont = 'url(evil)')],
    ['widget span outside 1-4', (p: Project) => (p.web.draft.widgets[0]!.layout.span = 9)],
    ['decoration that is also a diary photo', (p: Project) => p.web.draft.assets.push({ id: 'secret', kind: 'image', name: 'x' })],
    ['decoration without an image', (p: Project) => p.web.draft.assets.push({ id: 'nofile', kind: 'sticker', name: 'x' })],
    ['javascript: image link', (p: Project) => p.web.draft.widgets.push({ ...p.web.draft.widgets[0]!, id: 'img1', content: { type: 'image', caption: '', href: 'javascript:alert(1)' } })],
    ['missing image reference', (p: Project) => (p.posts[0]!.imageIds = ['nope'])],
    ['duplicate post slug', (p: Project) => (p.posts[1]!.slug = p.posts[0]!.slug)],
    ['control character', (p: Project) => (p.site.title = 'a\u0000b')],
    ['newline in title', (p: Project) => (p.site.title = 'a\nb')],
    ['bad video id', (p: Project) => (p.posts[0]!.video = { provider: 'youtube', videoId: '"><x' })],
    ['bad slug', (p: Project) => (p.site.slug = '../etc')],
  ])('rejects %s', (_name, mutate) => {
    const p = sample()
    mutate(p)
    expect(parseProject(p).ok).toBe(false)
  })
})

describe('compatibility', () => {
  it('loads a project saved before recordings existed', () => {
    const { recordings: _r, ...old } = legacySample()
    const r = parseProject(old)
    expect(r.ok && r.value.recordings).toEqual([])
  })

  it('migrates a v1 save: blocks become widgets in reading order, the theme becomes a style', () => {
    const r = parseProject(legacySample())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = r.value
    expect(p.schemaVersion).toBe(2)
    expect('theme' in p.site).toBe(false)
    expect(p.web.draft.style).toBe('retro')
    expect(p.web.draft.widgets.map((w) => [w.id, w.content.type])).toEqual([
      ['b1', 'diary'],
      ['b2', 'links'],
      ['b3', 'boo'],
      ['b4', 'diary'],
    ])
    expect(p.web.published).toBeUndefined()
  })

  it('maps the retired "meadow" theme to the scrapbook style', () => {
    const old = legacySample() as unknown as { site: { theme: string } }
    old.site.theme = 'meadow'
    const r = parseProject(old)
    expect(r.ok && r.value.web.draft.style).toBe('scrapbook')
  })

  it('rejects a v2 project without a website design', () => {
    const { web: _w, ...rest } = sample()
    expect(parseProject(rest).ok).toBe(false)
  })

  it.each([
    ['recording too long', { durationMs: 60_001 }],
    ['bad open-on date', { openOn: '2030-02-30' }],
    ['unsupported audio type', { mime: 'audio/wav' }],
    ['empty audio', { data: new Uint8Array() }],
  ])('rejects %s', (_label, patch) => {
    const p = sample()
    p.recordings = [{ id: 'r1', title: 'Hi', createdAt: '2026-11-21T08:00:00.000Z', visibility: 'public', durationMs: 1000, mime: 'audio/ogg', data: new Uint8Array([1]), ...patch } as never]
    expect(parseProject(p).ok).toBe(false)
  })
})

describe('video links', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', { provider: 'youtube', videoId: 'dQw4w9WgXcQ' }],
    ['https://youtu.be/dQw4w9WgXcQ?t=3', { provider: 'youtube', videoId: 'dQw4w9WgXcQ' }],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', { provider: 'youtube', videoId: 'dQw4w9WgXcQ' }],
    ['https://vimeo.com/76979871', { provider: 'vimeo', videoId: '76979871' }],
  ])('parses %s', (url, expected) => {
    expect(parseVideoUrl(url)).toEqual(expected)
  })

  it.each(['javascript:alert(1)', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=short', 'not a url'])(
    'rejects %s',
    (url) => expect(parseVideoUrl(url)).toBeNull(),
  )
})

describe('generated site', () => {
  it('contains the expected files and nothing private', () => {
    const files = generateSite(sample())
    expect([...files.keys()]).toEqual([
      'assets/sea.png',
      'feed.xml',
      'ghost.js',
      'index.html',
      'posts/first-day-at-the-sea.html',
      'room.js',
      'site.js',
      'site.json',
      'style.css',
    ])
    const all = [...files.values()].map((b) => dec.decode(b)).join('\n')
    expect(all).not.toContain('Unsent letter')
    expect(all).not.toContain('secret')
  })

  it('uses absolute RSS links only when a base URL is given', () => {
    const rel = dec.decode(generateSite(sample()).get('feed.xml')!)
    expect(rel).toContain('<link>posts/first-day-at-the-sea.html</link>')
    const abs = dec.decode(generateSite(sample(), { baseUrl: 'https://li.example/@moon' }).get('feed.xml')!)
    expect(abs).toContain('<link>https://li.example/@moon/posts/first-day-at-the-sea.html</link>')
  })

  it('rejects a non-http base URL', () => {
    expect(() => generateSite(sample(), { baseUrl: 'javascript:alert(1)' })).toThrow()
  })
})

describe('import safety', () => {
  const siteJson = () => unzipSync(exportSite(sample()))['site.json']!

  it('rejects files that are not ZIPs', () => {
    expect(importSite(strToU8('hello'))).toMatchObject({ ok: false })
  })

  it('rejects ZIPs with path traversal', () => {
    const zip = zipSync({ 'site.json': siteJson(), '../evil.txt': strToU8('x') })
    const r = importSite(zip)
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.reason).toContain('unsafe path')
  })

  it('rejects files over 50 MB without reading them', () => {
    expect(importSite(new Uint8Array(50 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: 'File is larger than 50 MB.' })
  })

  it('rejects an invalid site.json with a readable reason', () => {
    const zip = zipSync({ 'site.json': strToU8('{"schemaVersion":2}') })
    const r = importSite(zip)
    expect(r.ok).toBe(false)
  })

  it('rejects a site.json whose image file is missing', () => {
    const zip = zipSync({ 'site.json': siteJson() })
    expect(importSite(zip)).toEqual({ ok: false, reason: 'missing image file assets/sea.png' })
  })

  it('does not accept a backup as a site, or a site as a backup', () => {
    expect(importSite(createBackup(sample()))).toMatchObject({ ok: false })
    expect(restoreBackup(exportSite(sample()))).toMatchObject({ ok: false })
  })
})

describe('private backup', () => {
  it('keeps private drafts and their images, and has no website files', () => {
    const entries = unzipSync(createBackup(sample()))
    expect(Object.keys(entries).sort()).toEqual(['assets/sea.png', 'assets/secret.jpg', 'backup.json'])
    expect(dec.decode(entries['backup.json']!)).toContain('Unsent letter')
  })
})
