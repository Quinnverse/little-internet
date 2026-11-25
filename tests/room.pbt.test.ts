import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../src/core/backup.ts'
import { exportSite, importSite } from '../src/core/exportZip.ts'
import { normalize } from '../src/core/normalize.ts'
import { publicProjection } from '../src/core/privacy.ts'
import { DECOR_KINDS, MEMORY_KINDS, defaultRoom, roomIssues } from '../src/core/room.ts'
import { parseProject, type Project } from '../src/core/schema.ts'
import {
  addDecor,
  addPost,
  addRecording,
  deletePost,
  deleteRecording,
  moveDecor,
  moveMemoryObject,
  removeDecor,
  rotateDecor,
  setPostObject,
  setVisibility,
  setWelcome,
  createProject,
  type Command,
} from '../src/editor/commands.ts'
import { projectArb } from './arbitraries.ts'

const base = (): Project =>
  createProject({ title: 'Home', slug: 'home', style: 'scrapbook', ghostName: 'Boo', ghostColor: 'white' })

const withPosts = (n: number): Project => {
  let p = base()
  for (let i = 0; i < n; i++) {
    p = addPost({
      id: `post${i}`,
      createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      title: `Entry ${i}`,
      body: 'body',
      imageIds: [],
    })(p)
  }
  p = addRecording({
    id: 'rec0',
    title: 'Welcome',
    createdAt: '2026-01-01T00:00:00.000Z',
    durationMs: 1000,
    mime: 'audio/webm',
    data: new Uint8Array([1]),
  })(p)
  return p
}

const opArb = (n: number): fc.Arbitrary<Command> =>
  fc.oneof(
    fc.record({ kind: fc.constantFrom(...DECOR_KINDS), i: fc.nat(99) }).map(({ kind, i }) => addDecor(`dc${i}`, kind)),
    fc.record({ i: fc.nat(99), x: fc.integer({ min: -1, max: 6 }), z: fc.integer({ min: -1, max: 6 }) }).map(({ i, x, z }) => moveDecor(`dc${i}`, x, z)),
    fc.nat(99).map((i) => rotateDecor(`dc${i}`)),
    fc.nat(99).map((i) => removeDecor(`dc${i}`)),
    fc
      .record({ post: fc.nat(n - 1), kind: fc.option(fc.constantFrom(...MEMORY_KINDS), { nil: null }), i: fc.nat(99) })
      .map(({ post, kind, i }) => setPostObject(`post${post}`, kind, `mo${i}`)),
    fc
      .record({ i: fc.nat(99), slot: fc.constantFrom('shelf-1', 'shelf-6', 'desk-2', 'wall-1', 'wall-4', 'sill-2', 'nope') })
      .map(({ i, slot }) => moveMemoryObject(`mo${i}`, slot)),
    fc.nat(n - 1).map((i) => deletePost(`post${i}`)),
    fc.nat(n - 1).map((i) => setVisibility(`post${i}`, i % 2 ? 'public' : 'private')),
    fc.constantFrom(setWelcome('rec0'), setWelcome(null), deleteRecording('rec0')),
  )

describe('home room', () => {
  it('R1: any sequence of room commands leaves a valid project', () => {
    fc.assert(
      fc.property(fc.array(opArb(4), { minLength: 5, maxLength: 60 }), (ops) => {
        let p = withPosts(4)
        for (const op of ops) {
          let next: Project
          try {
            next = op(p)
          } catch {
            continue // a refused command is fine; it must not corrupt anything
          }
          const r = parseProject(next)
          expect(r.ok, r.ok ? '' : r.reason).toBe(true)
          if (r.ok) {
            expect(roomIssues(r.value.room)).toEqual([])
            p = r.value
          }
        }
      }),
      { numRuns: 150 },
    )
  })

  it('R2: visitors only get memory objects of public posts, and only a public welcome', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const pub = publicProjection(p)
        const publicIds = new Set(pub.posts.map((x) => x.id))
        for (const m of pub.room.memory) expect(publicIds.has(m.postId)).toBe(true)
        const w = pub.room.welcomeRecordingId
        if (w !== undefined) expect(pub.recordings.some((r) => r.id === w && r.visibility === 'public')).toBe(true)
        expect(parseProject(pub).ok).toBe(true)
      }),
      { numRuns: 150 },
    )
  })

  it('R3: room data survives export, import and backup round trips', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const pub = normalize(publicProjection(p))
        const imported = importSite(exportSite(p))
        expect(imported.ok && imported.value.room).toEqual(pub.room)
        const restored = restoreBackup(createBackup(p))
        expect(restored.ok && restored.value.room).toEqual(normalize(p).room)
      }),
      { numRuns: 100 },
    )
  })

  it('loads a project saved before the 3D home existed', () => {
    const { room: _r, ...old } = withPosts(1)
    const site = { ...old.site } as Record<string, unknown>
    delete site.lang
    const r = parseProject({ ...old, site })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.room).toEqual(defaultRoom())
      expect(r.value.site.lang).toBe('en')
    }
  })

  it('refuses decor on built-in furniture, overlaps, and dangling references', () => {
    const p = withPosts(1)
    expect(() => moveDecor('plant-1', 0, 0)(p)).toThrow()
    expect(() => moveDecor('plant-1', 2, 1)(p)).toThrow() // lamp is there
    const bad = { ...p, room: { ...p.room, memory: [{ id: 'm', kind: 'shell' as const, postId: 'ghost', slot: 'shelf-1' }] } }
    expect(parseProject(bad).ok).toBe(false)
    const bad2 = { ...p, room: { ...p.room, welcomeRecordingId: 'nope' } }
    expect(parseProject(bad2).ok).toBe(false)
  })

  it('moves decor off cells that became furniture, so older saves still load', () => {
    const p = withPosts(1)
    const old = { ...p, room: { ...p.room, decor: [...p.room.decor, { id: 'old-1', kind: 'stool', x: 2, z: 0, rot: 0 }] } }
    const r = parseProject(old)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const moved = r.value.room.decor.find((d) => d.id === 'old-1')!
      expect([moved.x, moved.z]).not.toEqual([2, 0])
      expect(roomIssues(r.value.room)).toEqual([])
    }
  })

  it('puts memory objects on kind-appropriate slots and removes them with the entry', () => {
    let p = withPosts(2)
    p = setPostObject('post0', 'postcard', 'o1')(p)
    p = setPostObject('post1', 'shell', 'o2')(p)
    expect(p.room.memory.find((m) => m.postId === 'post0')?.slot).toMatch(/^wall-/)
    expect(p.room.memory.find((m) => m.postId === 'post1')?.slot).toMatch(/^shelf-|^sill-|^desk-/)
    p = deletePost('post0')(p)
    expect(p.room.memory.map((m) => m.postId)).toEqual(['post1'])
  })
})
