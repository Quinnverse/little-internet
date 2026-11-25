// Kiro Task C: a full private backup restores ids, keepsake links, room layout, website design,
// media and visibility exactly; old (schema v1) saves migrate without making anything public.
import fc from 'fast-check'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../src/core/backup.ts'
import { exportSite, importSite } from '../src/core/exportZip.ts'
import { normalize } from '../src/core/normalize.ts'
import { defaultRoom } from '../src/core/room.ts'
import { parseProject } from '../src/core/schema.ts'
import { projectArb } from './arbitraries.ts'

const dec = new TextDecoder()

describe('Task C: private backup round trip', () => {
  it('C1: ids, keepsake links, room, website draft + snapshot, media and visibility survive', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const r = restoreBackup(createBackup(p))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        const q = r.value
        expect(q.posts.map((x) => [x.id, x.slug, x.visibility, x.imageIds]).sort()).toEqual(p.posts.map((x) => [x.id, x.slug, x.visibility, x.imageIds]).sort())
        expect(q.assets.map((a) => [a.id, a.mime, [...a.data]]).sort()).toEqual(p.assets.map((a) => [a.id, a.mime, [...a.data]]).sort())
        expect(q.recordings.map((x) => [x.id, x.visibility, [...x.data]]).sort()).toEqual(p.recordings.map((x) => [x.id, x.visibility, [...x.data]]).sort())
        // keepsakes still point at real entries, same slots
        const ids = new Set(q.posts.map((x) => x.id))
        for (const m of q.room.memory) expect(ids.has(m.postId)).toBe(true)
        expect(q.room).toEqual(normalize(p).room)
        // website: the draft and the published snapshot are both kept and stay separate
        expect(q.web).toEqual(normalize(p).web)
        expect(!!q.web.published).toBe(!!p.web.published)
        expect(q.links).toEqual(p.links)
        expect(q.site).toEqual(p.site)
      }),
      { numRuns: 80 },
    )
  })

  it('C2: a backup keeps private entries; the site export of the same project never does', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const backup = unzipSync(createBackup(p))
        const site = unzipSync(exportSite(p))
        expect('index.html' in backup).toBe(false)
        const priv = p.posts.filter((x) => x.visibility === 'private')
        const manifest = dec.decode(backup['backup.json']!)
        for (const x of priv) expect(manifest).toContain(x.id)
        expect(Object.keys(site).some((n) => n === 'backup.json')).toBe(false)
        // importing the site export gives back only public posts
        const imported = importSite(exportSite(p))
        expect(imported.ok && imported.value.posts.every((x) => x.visibility === 'public')).toBe(true)
      }),
      { numRuns: 25 },
    )
  })
})

describe('Task C: old saves migrate safely', () => {
  const legacy = () => ({
    schemaVersion: 1,
    site: { slug: 'old-home', title: 'Old home', tagline: '', theme: 'midnight', lang: 'en' },
    ghost: { enabled: true, name: 'Boo', color: 'white' },
    assets: [
      { id: 'pubpic', mime: 'image/png', data: new Uint8Array([137, 80, 78, 71]) },
      { id: 'secretpic', mime: 'image/jpeg', data: new Uint8Array([255, 216, 255]) },
    ],
    posts: [
      { id: 'p1', slug: 'hello', title: 'Hello', body: 'public', createdAt: '2026-11-20T09:30:00.000Z', visibility: 'public', imageIds: ['pubpic'] },
      { id: 'p2', slug: 'diary', title: 'Private diary', body: 'TOPSECRET', createdAt: '2026-11-21T09:30:00.000Z', visibility: 'private', imageIds: ['secretpic'] },
    ],
    // v1 block grid: a free-standing photo block of a PRIVATE entry's photo, a post block, a note
    blocks: [
      { id: 'b1', x: 0, y: 0, w: 2, h: 2, content: { kind: 'image', assetId: 'secretpic' } },
      { id: 'b2', x: 2, y: 0, w: 2, h: 1, content: { kind: 'post', postId: 'p1' } },
      { id: 'b3', x: 0, y: 2, w: 4, h: 1, content: { kind: 'text', text: 'hello world' } },
    ],
    links: [],
    webring: {},
    room: defaultRoom(),
    recordings: [],
  })

  it('C3: a v1 save becomes v2 with the same content ids and a usable design', () => {
    const r = parseProject(legacy())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.schemaVersion).toBe(2)
    expect(r.value.posts.map((x) => x.id)).toEqual(['p1', 'p2'])
    expect(r.value.assets.map((a) => a.id).sort()).toEqual(['pubpic', 'secretpic'])
    expect(r.value.web.draft.widgets.length).toBe(3)
    // migrating twice changes nothing (idempotent), and a backup of the migrated project restores equal
    const again = parseProject(r.value)
    expect(again.ok && again.value).toEqual(r.value)
    const back = restoreBackup(createBackup(r.value))
    expect(back).toEqual({ ok: true, value: normalize(r.value) })
  })

  it('C4: migration never makes a private entry\'s photo public', () => {
    const r = parseProject(legacy())
    if (!r.ok) throw new Error(r.reason)
    const files = unzipSync(exportSite(r.value))
    expect(Object.keys(files).some((n) => n.includes('secretpic'))).toBe(false)
    const text = Object.entries(files).filter(([n]) => !n.startsWith('assets/')).map(([, b]) => dec.decode(b)).join('\n')
    expect(text).not.toContain('TOPSECRET')
    expect(text).not.toContain('Private diary')
    expect(text).not.toContain('secretpic')
    // the public photo of the public entry is still shipped
    expect(Object.keys(files)).toContain('assets/pubpic.png')
  })
})
