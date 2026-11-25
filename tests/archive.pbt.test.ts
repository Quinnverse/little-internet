// Life Archive: types, structured fields, tags, search, filters, timeline, batch commands, migration, privacy.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { allTags, countByKind, EMPTY_FILTER, filterPosts, groupByMonth, parseTags, postsToMarkdown, POST_KINDS, TAG_PATTERN } from '../src/core/archive.ts'
import { exportSite } from '../src/core/exportZip.ts'
import { parseProject, type Project } from '../src/core/schema.ts'
import { addPost, addTagToMany, compose, createProject, deleteMany, setManyVisibility, setVisibility, toggleStar } from '../src/editor/commands.ts'
import { projectArb } from './arbitraries.ts'

const dec = new TextDecoder()
const blank = (): Project => createProject({ title: 'Home', slug: 'home', style: 'blank', ghostName: 'Boo', ghostColor: 'white' })

describe('Life Archive', () => {
  it('L1: parseTags gives unique, valid, lower-case tags and never more than 12', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (input) => {
        const tags = parseTags(input)
        expect(tags.length).toBeLessThanOrEqual(12)
        expect(new Set(tags).size).toBe(tags.length)
        for (const t of tags) expect(TAG_PATTERN.test(t) && t === t.toLowerCase()).toBe(true)
      }),
      { numRuns: 300 },
    )
    expect(parseTags('#Reading, cozy  Winter #reading 书')).toEqual(['reading', 'cozy', 'winter', '书'])
  })

  it('L2: filters are exact: every result matches every active filter and nothing that matches is lost', () => {
    fc.assert(
      fc.property(
        projectArb,
        fc.record({ kind: fc.constantFrom('all' as const, ...POST_KINDS), visibility: fc.constantFrom('all' as const, 'public' as const, 'private' as const), starred: fc.boolean() }),
        (p, f) => {
          const filter = { ...EMPTY_FILTER, ...f }
          const out = filterPosts(p.posts, filter)
          const expected = p.posts.filter((x) => (f.kind === 'all' || x.kind === f.kind) && (f.visibility === 'all' || x.visibility === f.visibility) && (!f.starred || x.starred))
          expect(new Set(out.map((x) => x.id))).toEqual(new Set(expected.map((x) => x.id)))
          for (let i = 1; i < out.length; i++) expect(out[i - 1]!.createdAt >= out[i]!.createdAt).toBe(true)
          expect(countByKind(p.posts).all).toBe(p.posts.length)
          expect(groupByMonth(out).flatMap((m) => m.posts).length).toBe(out.length)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('L3: search finds structured fields and tags, not only the body', () => {
    let p = blank()
    p = compose(
      addPost({ id: 'r1', createdAt: '2026-11-01T09:00:00.000Z', title: 'On a rainy day', body: 'plain words', imageIds: [], kind: 'reading', tags: ['cozy'], fields: { book: 'Middlemarch', author: 'George Eliot', rating: '5' } }),
      addPost({ id: 'o1', createdAt: '2026-11-02T09:00:00.000Z', title: 'Friday', body: 'plain words', imageIds: [], kind: 'outfit', fields: { occasion: 'wedding' } }),
    )(p)
    const ids = (q: string) => filterPosts(p.posts, { ...EMPTY_FILTER, q }).map((x) => x.id)
    expect(ids('middlemarch')).toEqual(['r1'])
    expect(ids('eliot cozy')).toEqual(['r1'])
    expect(ids('wedding')).toEqual(['o1'])
    expect(ids('reading note')).toEqual(['r1'])
    expect(ids('nothing here')).toEqual([])
    expect(allTags(p.posts)).toEqual([{ tag: 'cozy', count: 1 }])
  })

  it('L4: new records are private; batch commands touch only the selected ones and keep the project valid', () => {
    let p = blank()
    p = compose(
      addPost({ id: 'a', createdAt: '2026-11-01T09:00:00.000Z', title: 'A', body: 'a', imageIds: [] }),
      addPost({ id: 'b', createdAt: '2026-11-02T09:00:00.000Z', title: 'B', body: 'b', imageIds: [], kind: 'memo' }),
      addPost({ id: 'c', createdAt: '2026-11-03T09:00:00.000Z', title: 'C', body: 'c', imageIds: [], kind: 'travel' }),
    )(p)
    expect(p.posts.every((x) => x.visibility === 'private')).toBe(true)
    p = setManyVisibility(['a', 'c'], 'public')(p)
    expect(p.posts.map((x) => [x.id, x.visibility]).sort()).toEqual([['a', 'public'], ['b', 'private'], ['c', 'public']])
    p = addTagToMany(['a', 'b'], 'trip')(p)
    expect(p.posts.find((x) => x.id === 'c')!.tags).toEqual([])
    expect(p.posts.find((x) => x.id === 'a')!.tags).toEqual(['trip'])
    p = toggleStar('b')(p)
    expect(p.posts.find((x) => x.id === 'b')!.starred).toBe(true)
    p = deleteMany(['a', 'b'])(p)
    expect(p.posts.map((x) => x.id)).toEqual(['c'])
    expect(parseProject(p).ok).toBe(true)
  })

  it('L5: a save from before the archive loads as diary entries with no tags (ids and permissions unchanged)', () => {
    const old = JSON.parse(JSON.stringify(blank(), (_k, v) => (v instanceof Uint8Array ? [...v] : v)))
    old.posts = [{ id: 'p1', slug: 'hello', title: 'Hello', body: 'hi', createdAt: '2026-01-01T00:00:00.000Z', visibility: 'public', imageIds: [] }]
    const r = parseProject(old)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.posts[0]).toMatchObject({ id: 'p1', visibility: 'public', kind: 'diary', tags: [], fields: {}, starred: false })
  })

  it('L6: private records (their type, fields, quote and tags) never reach the website; public ones show them', () => {
    let p = blank()
    p = compose(
      addPost({ id: 'pub', createdAt: '2026-11-01T09:00:00.000Z', title: 'Public read', body: 'x', imageIds: [], kind: 'reading', tags: ['openbook'], fields: { book: 'Walden', quote: 'PUBLICQUOTE' } }),
      addPost({ id: 'sec', createdAt: '2026-11-02T09:00:00.000Z', title: 'Secret read', body: 'y', imageIds: [], kind: 'reading', tags: ['hushtag'], fields: { book: 'SECRETBOOK', quote: 'SECRETQUOTE' } }),
      setVisibility('pub', 'public'),
    )(p)
    const files = unzipSync(exportSite(p))
    const text = Object.entries(files).filter(([n]) => !n.startsWith('assets/')).map(([, b]) => dec.decode(b)).join('\n')
    for (const leak of ['SECRETBOOK', 'SECRETQUOTE', 'hushtag', 'Secret read']) expect(text).not.toContain(leak)
    const page = dec.decode(files['posts/public-read.html']!)
    expect(page).toContain('Walden')
    expect(page).toContain('PUBLICQUOTE')
    expect(page).toContain('#openbook')
  })

  it('L7: the Markdown copy lists every chosen record once', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const md = postsToMarkdown(p.posts)
        expect((md.match(/^## /gm) ?? []).length).toBe(p.posts.length)
      }),
      { numRuns: 60 },
    )
  })
})
