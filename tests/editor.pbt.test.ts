import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { POST_SLUG_PATTERN, parseProject, type Project } from '../src/core/schema.ts'
import { WIDGET_TYPES, STYLES } from '../src/core/design.ts'
import * as D from '../src/core/designOps.ts'
import * as C from '../src/editor/commands.ts'
import { slugify, suggestSiteSlug, uniquePostSlug } from '../src/editor/ids.ts'
import { idArb, lineArb, textArb, urlArb } from './arbitraries.ts'

const titleArb = fc.oneof(lineArb(120), fc.constantFrom('海边的一天', '😀😀', 'Über café', '', '---', 'a'.repeat(120)))

/** Command descriptors; indices pick among existing items at run time. */
const stepArb = fc.oneof(
  fc.record({ t: fc.constant('addPost' as const), title: titleArb, body: textArb(500), photos: fc.nat({ max: 2 }) }),
  fc.record({ t: fc.constant('updatePost' as const), i: fc.nat(), title: titleArb, dropPhotos: fc.boolean() }),
  fc.record({ t: fc.constant('publish' as const), i: fc.nat(), pub: fc.boolean() }),
  fc.record({ t: fc.constant('deletePost' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('addWidget' as const), type: fc.constantFrom(...WIDGET_TYPES), at: fc.nat({ max: 20 }) }),
  fc.record({ t: fc.constant('addPhotoWidget' as const), kind: fc.constantFrom('image' as const, 'sticker' as const, 'background' as const) }),
  fc.record({ t: fc.constant('pickEntry' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('addNote' as const), text: textArb(500) }),
  fc.record({ t: fc.constant('move' as const), i: fc.nat(), to: fc.integer({ min: -2, max: 30 }) }),
  fc.record({ t: fc.constant('resize' as const), i: fc.nat(), span: fc.integer({ min: 1, max: 4 }), mobile: fc.constantFrom('full' as const, 'half' as const, 'hide' as const) }),
  fc.record({ t: fc.constant('hide' as const), i: fc.nat(), hidden: fc.boolean() }),
  fc.record({ t: fc.constant('deleteWidget' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('removeDecoration' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('addPage' as const), title: lineArb(40) }),
  fc.record({ t: fc.constant('removePage' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('style' as const), style: fc.constantFrom(...STYLES), keep: fc.boolean() }),
  fc.record({ t: fc.constant('publishSite' as const) }),
  fc.record({ t: fc.constant('revert' as const) }),
  fc.record({ t: fc.constant('addLink' as const), title: lineArb(80), url: urlArb }),
  fc.record({ t: fc.constant('deleteLink' as const), i: fc.nat() }),
  fc.record({ t: fc.constant('site' as const), title: lineArb(80), tagline: lineArb(200) }),
  fc.record({ t: fc.constant('record' as const), title: lineArb(80), ms: fc.integer({ min: 1, max: 60_000 }) }),
  fc.record({ t: fc.constant('publishRec' as const), i: fc.nat(), pub: fc.boolean() }),
  fc.record({ t: fc.constant('renameRec' as const), i: fc.nat(), title: lineArb(80), openOn: fc.option(fc.constantFrom('2030-01-01', '2099-12-31')) }),
  fc.record({ t: fc.constant('deleteRec' as const), i: fc.nat() }),
)

function start(): Project {
  return C.createProject({ title: 'Home', slug: 'home', style: 'retro', ghostName: 'Boo', ghostColor: 'white' })
}

export const DESIGN_STEPS = new Set(['addWidget', 'addPhotoWidget', 'pickEntry', 'addNote', 'move', 'resize', 'hide', 'deleteWidget', 'removeDecoration', 'addPage', 'removePage', 'style', 'publishSite', 'revert'])

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
      case 'addWidget': {
        const page = p.web.draft.pages[0]!.id
        if (p.web.draft.widgets.length < 100) cmd = C.design(D.addWidget(nextId(), page, s.type, 'en', s.at))
        break
      }
      case 'addPhotoWidget': {
        const asset = { id: nextId(), mime: 'image/png' as const, data: new Uint8Array([2]) }
        const page = p.web.draft.pages[0]!.id
        const widget =
          s.kind === 'background'
            ? D.setTokens({ bgAssetId: asset.id })
            : D.addWidget(nextId(), page, s.kind, 'en', undefined, s.kind === 'image' ? { type: 'image', assetId: asset.id, caption: '' } : { type: 'sticker', sticker: 'star', assetId: asset.id, size: 'm', motion: 'none' })
        if (p.web.draft.widgets.length < 100) cmd = C.compose(C.addAsset(asset), C.design((d) => widget(D.addDecoration({ id: asset.id, kind: s.kind, name: 'x' })(d))))
        break
      }
      case 'pickEntry': {
        const post = at(p.posts, s.i)
        const page = p.web.draft.pages[0]!.id
        if (post && p.web.draft.widgets.length < 100)
          cmd = C.design(D.addWidget(nextId(), page, 'diary', 'en', 0, { type: 'diary', heading: '', mode: 'pick', postIds: [post.id], count: 1, excerpts: true }))
        break
      }
      case 'addNote': {
        const page = p.web.draft.pages[0]!.id
        if (p.web.draft.widgets.length < 100) cmd = C.design(D.addWidget(nextId(), page, 'text', 'en', undefined, { type: 'text', heading: '', text: s.text }))
        break
      }
      case 'move': {
        const w = at(p.web.draft.widgets, s.i)
        if (w) cmd = C.design(D.moveWidget(w.id, s.to))
        break
      }
      case 'resize': {
        const w = at(p.web.draft.widgets, s.i)
        if (w) cmd = C.design(D.setWidgetLayout(w.id, { span: s.span, mobile: s.mobile }))
        break
      }
      case 'hide': {
        const w = at(p.web.draft.widgets, s.i)
        if (w) cmd = C.design(D.setWidgetHidden(w.id, s.hidden))
        break
      }
      case 'deleteWidget': {
        const w = at(p.web.draft.widgets, s.i)
        if (w) cmd = C.design(D.removeWidget(w.id))
        break
      }
      case 'removeDecoration': {
        const a = at(p.web.draft.assets, s.i)
        if (a) cmd = C.design(D.removeDecoration(a.id))
        break
      }
      case 'addPage': {
        if (p.web.draft.pages.length < 8) {
          const id = nextId()
          cmd = C.design(D.addPage({ id, slug: `p-${id.replace(/[^a-z0-9]/g, '')}`, title: s.title, nav: true, columns: 2 }))
        }
        break
      }
      case 'removePage': {
        const page = at(p.web.draft.pages.slice(1), s.i)
        if (page) cmd = C.design(D.removePage(page.id))
        break
      }
      case 'style': {
        const page = p.web.draft.pages[0]!.id
        const base = n
        n += 20
        cmd = C.design(D.applyStyle(s.style, { keepWidgets: s.keep, pageId: page, lang: 'en', newId: (i) => `st${base}-${i}` }))
        break
      }
      case 'publishSite':
        cmd = C.publishDraft(new Date(1_700_000_000_000 + n * 1000).toISOString())
        break
      case 'revert':
        cmd = C.revertDraft
        break
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
  it('E3: after deletes and edits there are no orphan images and no dangling website references', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 10, maxLength: 40, size: 'max' }), (steps) => {
        run(steps, (p, s) => {
          if (!['deletePost', 'deleteWidget', 'removeDecoration', 'updatePost', 'revert', 'deleteLink'].includes(s.t)) return
          const used = new Set<string>()
          p.posts.forEach((x) => x.imageIds.forEach((id) => used.add(id)))
          for (const d of [p.web.draft, p.web.published?.design]) d?.assets.forEach((a) => used.add(a.id))
          p.links.forEach((l) => l.buttonAssetId && used.add(l.buttonAssetId))
          expect(p.assets.every((a) => used.has(a.id))).toBe(true)
          const postIds = new Set(p.posts.map((x) => x.id))
          for (const d of [p.web.draft, p.web.published?.design]) {
            for (const w of d?.widgets ?? []) if (w.content.type === 'diary') expect(w.content.postIds.every((id) => postIds.has(id))).toBe(true)
          }
        })
      }),
      { numRuns: 200 },
    )
  })

  // E5 — Web Atelier: decorating the website never touches entries, the room or recordings,
  // and never changes what visitors see until the owner publishes.
  it('E5: website design steps leave content and the published snapshot alone', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 10, maxLength: 40, size: 'max' }), (steps) => {
        let before = start()
        run(steps, (p, s) => {
          if (DESIGN_STEPS.has(s.t)) {
            expect(p.posts).toEqual(before.posts)
            expect(p.room).toEqual(before.room)
            expect(p.recordings).toEqual(before.recordings)
            expect(p.links).toEqual(before.links)
            if (s.t !== 'publishSite') expect(p.web.published).toEqual(before.web.published)
            else expect(p.web.published?.design).toEqual(p.web.draft)
          }
          before = p
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
