import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { POST_SLUG_PATTERN, parseProject, type Project } from '../src/core/schema.ts'
import * as C from '../src/editor/commands.ts'
import { slugify, suggestSiteSlug, uniquePostSlug } from '../src/editor/ids.ts'
import { idArb, lineArb, textArb, urlArb } from './arbitraries.ts'

const sizes: C.BlockSize[] = [
  { w: 1, h: 1 },
  { w: 2, h: 1 },
  { w: 2, h: 2 },
  { w: 4, h: 1 },
  { w: 4, h: 2 },
]

const titleArb = fc.oneof(lineArb(120), fc.constantFrom('海边的一天', '😀😀', 'Über café', '', '---', 'a'.repeat(120)))

/** Command descriptors; indices pick among existing items at run time. */
const stepArb = fc.oneof(
  fc.record({ t: fc.constant('addPost' as const), title: titleArb, body: textArb(500), photos: fc.nat({ max: 2 }) }),
  fc.record({ t: fc.constant('updatePost' as const), i: fc.nat(), title: titleArb, dropPhotos: fc.boolean() }),
  fc.record({ t: fc.constant('publish' as const), i: fc.nat(), pub: fc.boolean() }),
  fc.record({ t: fc.constant('deletePost' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('addPhotoBlock' as const), s: fc.constantFrom(...sizes) }),
  fc.record({ t: fc.constant('addPostBlock' as const), i: fc.nat(), s: fc.constantFrom(...sizes) }),
  fc.record({ t: fc.constant('addNote' as const), text: textArb(500), s: fc.constantFrom(...sizes) }),
  fc.record({ t: fc.constant('move' as const), i: fc.nat(), x: fc.integer({ min: 0, max: 3 }), y: fc.integer({ min: 0, max: 10 }) }),
  fc.record({ t: fc.constant('resize' as const), i: fc.nat(), s: fc.constantFrom(...sizes) }),
  fc.record({ t: fc.constant('deleteBlock' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('addLink' as const), title: lineArb(80), url: urlArb }),
  fc.record({ t: fc.constant('deleteLink' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('site' as const), title: lineArb(80), tagline: lineArb(200) }),
  fc.record({ t: fc.constant('record' as const), title: lineArb(80), ms: fc.integer({ min: 1, max: 60_000 }) }),
  fc.record({ t: fc.constant('publishRec' as const), i: fc.nat(), pub: fc.boolean() }),
  fc.record({ t: fc.constant('renameRec' as const), i: fc.nat(), title: lineArb(80), openOn: fc.option(fc.constantFrom('2030-01-01', '2099-12-31')) }),
  fc.record({ t: fc.constant('deleteRec' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('addVoiceBlock' as const), s: fc.constantFrom(...sizes) }),
)

function start(): Project {
  return C.createProject(
    { title: 'Home', slug: 'home', theme: 'paper', ghostName: 'Boo', ghostColor: 'white' },
    ['b0', 'b1', 'b2'],
  )
}

function run(steps: fc.Arbitrary<unknown>[] | unknown[], check: (p: Project, step: { t: string }) => void) {
  let p = start()
  let n = 0
  const nextId = () => `id${n++}`
  const at = <T,>(xs: T[], i: number) => (xs.length ? xs[i % xs.length] : undefined)
  for (const raw of steps as Array<Record<string, never> & { t: string }>) {
    const s = raw as any
    let cmd: C.Command | undefined
    switch (s.t) {
      case 'addPost': {
        const photos = Array.from({ length: s.photos }, () => ({ id: nextId(), mime: 'image/jpeg' as const, data: new Uint8Array([1]) }))
        cmd = C.compose(
          ...photos.map(C.addAsset),
          C.addPost({ id: nextId(), createdAt: new Date(1_700_000_000_000 + n * 1000).toISOString(), title: s.title, body: s.body, imageIds: photos.map((x) => x.id) }),
        )
        break
      }
      case 'updatePost': {
        const post = at(p.posts, s.i)
        if (post) cmd = C.updatePost(post.id, { title: s.title, ...(s.dropPhotos ? { imageIds: [] } : {}) })
        break
      }
      case 'publish': {
        const post = at(p.posts, s.i)
        if (post) cmd = C.setVisibility(post.id, s.pub ? 'public' : 'private')
        break
      }
      case 'deletePost': {
        const post = at(p.posts, s.i)
        if (post) cmd = C.deletePost(post.id)
        break
      }
      case 'addPhotoBlock': {
        const asset = { id: nextId(), mime: 'image/png' as const, data: new Uint8Array([2]) }
        cmd = C.compose(C.addAsset(asset), C.addBlock(nextId(), { kind: 'image', assetId: asset.id }, s.s))
        break
      }
      case 'addPostBlock': {
        const post = at(p.posts, s.i)
        if (post) cmd = C.addBlock(nextId(), { kind: 'post', postId: post.id }, s.s)
        break
      }
      case 'addNote':
        cmd = C.addBlock(nextId(), { kind: 'text', text: s.text }, s.s)
        break
      case 'move': {
        const b = at(p.blocks, s.i)
        if (b) cmd = C.moveBlockTo(b.id, s.x, s.y)
        break
      }
      case 'resize': {
        const b = at(p.blocks, s.i)
        if (b) cmd = C.resizeBlockTo(b.id, s.s)
        break
      }
      case 'deleteBlock': {
        const b = at(p.blocks, s.i)
        if (b) cmd = C.deleteBlock(b.id)
        break
      }
      case 'addLink':
        cmd = C.addLink({ id: nextId(), title: s.title, url: s.url })
        break
      case 'deleteLink': {
        const l = at(p.links, s.i)
        if (l) cmd = C.deleteLink(l.id)
        break
      }
      case 'site':
        cmd = C.updateSite({ title: s.title, tagline: s.tagline })
        break
      case 'record':
        if (p.recordings.length < 20) {
          cmd = C.addRecording({ id: nextId(), title: s.title, createdAt: new Date(1_700_000_000_000 + n * 1000).toISOString(), durationMs: s.ms, mime: 'audio/webm', data: new Uint8Array([1, 2]) })
        }
        break
      case 'publishRec': {
        const r = at(p.recordings, s.i)
        if (r) cmd = C.setRecordingVisibility(r.id, s.pub ? 'public' : 'private')
        break
      }
      case 'renameRec': {
        const r = at(p.recordings, s.i)
        if (r) cmd = C.updateRecording(r.id, { title: s.title, openOn: s.openOn })
        break
      }
      case 'deleteRec': {
        const r = at(p.recordings, s.i)
        if (r) cmd = C.deleteRecording(r.id)
        break
      }
      case 'addVoiceBlock':
        cmd = C.addBlock(nextId(), { kind: 'voice' }, s.s)
        break
    }
    if (!cmd) continue
    p = cmd(p)
    check(p, s)
  }
  return p
}

describe('editor command properties', () => {
  it('the starting project is valid', () => {
    expect(parseProject(start()).ok).toBe(true)
  })

  // E1 — Requirement 3.1
  it('E1: any sequence of commands with well-formed input keeps the project valid', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 10, maxLength: 40, size: 'max' }), (steps) => {
        run(steps, (p, s) => {
          const r = parseProject(p)
          if (!r.ok) throw new Error(`after ${s.t}: ${r.reason}`)
        })
      }),
      { numRuns: 200 },
    )
  })

  // E2 — Requirement 4.1
  it('E2: new entries are private; only setVisibility changes that', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 10, maxLength: 40, size: 'max' }), (steps) => {
        const published = new Set<string>()
        let before: Project = start()
        run(steps, (p, s) => {
          const prevIds = new Set(before.posts.map((x) => x.id))
          for (const post of p.posts) {
            if (!prevIds.has(post.id)) expect(post.visibility).toBe('private')
            const old = before.posts.find((x) => x.id === post.id)
            if (old && old.visibility !== post.visibility) expect(s.t).toBe('publish')
            if (post.visibility === 'public') published.add(post.id)
          }
          const prevRecs = new Map(before.recordings.map((r) => [r.id, r.visibility]))
          for (const r of p.recordings) {
            if (!prevRecs.has(r.id)) expect(r.visibility).toBe('private')
            else if (prevRecs.get(r.id) !== r.visibility) expect(s.t).toBe('publishRec')
          }
          before = p
        })
      }),
      { numRuns: 200 },
    )
  })

  // E3 — Requirement 3.2
  it('E3: after deletes and edits there are no orphan images and no dangling blocks', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 10, maxLength: 40, size: 'max' }), (steps) => {
        run(steps, (p, s) => {
          if (!['deletePost', 'deleteBlock', 'updatePost'].includes(s.t)) return
          const used = new Set<string>()
          p.posts.forEach((x) => x.imageIds.forEach((id) => used.add(id)))
          p.blocks.forEach((b) => b.content.kind === 'image' && used.add(b.content.assetId))
          expect(p.assets.every((a) => used.has(a.id))).toBe(true)
          const postIds = new Set(p.posts.map((x) => x.id))
          expect(p.blocks.every((b) => b.content.kind !== 'post' || postIds.has(b.content.postId))).toBe(true)
        })
      }),
      { numRuns: 200 },
    )
  })

  // E4 — Requirement 4.5
  it('E4: generated post slugs are valid and unique for any titles', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(titleArb, idArb.map((s) => s.replace(/[_-]/g, 'a'))), { maxLength: 40 }), (entries) => {
        const taken = new Set<string>()
        for (const [title, id] of entries) {
          const slug = uniquePostSlug(title, id, taken)
          expect(slug).toMatch(POST_SLUG_PATTERN)
          expect(taken.has(slug)).toBe(false)
          taken.add(slug)
        }
      }),
      { numRuns: 300 },
    )
  })
})

describe('editor helpers', () => {
  it('slugify handles accents and CJK', () => {
    expect(slugify('Über Café — Day 1')).toBe('uber-cafe-day-1')
    expect(slugify('海边的一天')).toBe('')
    expect(suggestSiteSlug('海边的一天')).toBe('my-home')
    expect(suggestSiteSlug("Moon's Corner")).toBe('moon-s-corner')
  })

  it.each([
    ['friend.example', 'https://friend.example/'],
    ['https://friend.example/a?b=1', 'https://friend.example/a?b=1'],
    ['  http://x.example  ', 'http://x.example/'],
    ['javascript:alert(1)', null],
    ['https://u:p@x.example', null],
    ['not a url', null],
    ['localhost', null],
  ])('normalizeUserUrl(%s)', (input, expected) => {
    expect(C.normalizeUserUrl(input)).toBe(expected)
  })
})
