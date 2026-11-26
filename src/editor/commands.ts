// Pure editor commands. Every data change in the UI goes through one of these and is
// then validated by `parseProject` in the store (Requirement 3.1).
import type { PostKind } from '../core/archive.ts'
import { designAssetRefs, starterDesign, type GuestNote, type SiteDesign, type StyleId } from '../core/design.ts'
import type { DesignOp } from '../core/designOps.ts'
import type {
  Asset,
  Gift,
  GHOST_COLORS,
  Lang,
  Link,
  Post,
  Project,
  Recording,
  VideoEmbed,
} from '../core/schema.ts'
import {
  autoSlot,
  canPlaceDecor,
  defaultRoom,
  firstFreeCell,
  freeSlotsFor,
  MAX_DECOR,
  type DecorKind,
  type MemoryKind,
  type Room,
} from '../core/room.ts'
import { uniquePostSlug } from './ids.ts'

export type Command = (p: Project) => Project

export const compose =
  (...cmds: Command[]): Command =>
  (p) =>
    cmds.reduce((acc, c) => c(acc), p)

// ------------------------------------------------------------------ project

export type NewProjectInput = {
  lang?: Lang
  title: string
  slug: string
  style: StyleId
  ghostName: string
  ghostColor: (typeof GHOST_COLORS)[number]
}

/** A new home is never empty: its website starts from the chosen style, ready to decorate. */
export function createProject(input: NewProjectInput): Project {
  const lang = input.lang ?? 'en'
  return {
    schemaVersion: 2,
    site: { slug: input.slug, title: input.title, tagline: '', lang },
    ghost: { enabled: true, name: input.ghostName, color: input.ghostColor },
    web: { draft: starterDesign(input.style, { title: input.title, lang }), guestbook: [] },
    posts: [],
    links: [],
    webring: {},
    gifts: [],
    room: defaultRoom(),
    assets: [],
    recordings: [],
  }
}

export const updateSite =
  (patch: Partial<Project['site']>): Command =>
  (p) => ({ ...p, site: { ...p.site, ...patch } })

export const updateGhost =
  (patch: Partial<Project['ghost']>): Command =>
  (p) => ({ ...p, ghost: { ...p.ghost, ...patch } })

// ------------------------------------------------------------------ assets

export const addAsset =
  (asset: Asset): Command =>
  (p) => ({ ...p, assets: [...p.assets.filter((a) => a.id !== asset.id), asset] })

/** Removes images that no post, no website design (draft or published) and no friend badge uses. */
export const collectGarbage: Command = (p) => {
  const used = new Set<string>()
  for (const post of p.posts) post.imageIds.forEach((id) => used.add(id))
  for (const d of [p.web.draft, p.web.published?.design]) {
    if (!d) continue
    d.assets.forEach((a) => used.add(a.id))
    designAssetRefs(d).forEach((id) => used.add(id))
  }
  for (const l of p.links) if (l.buttonAssetId) used.add(l.buttonAssetId)
  return { ...p, assets: p.assets.filter((a) => used.has(a.id)) }
}

// ------------------------------------------------------------------ posts

export type NewPostInput = {
  id: string
  createdAt: string
  title: string
  body: string
  imageIds: string[]
  video?: VideoEmbed
  kind?: PostKind
  tags?: string[]
  fields?: Post['fields']
  starred?: boolean
}

/** New entries are ALWAYS private (Requirement 4.1). */
export const addPost =
  (input: NewPostInput): Command =>
  (p) => {
    const slug = uniquePostSlug(input.title, input.id, new Set(p.posts.map((x) => x.slug)))
    const post: Post = {
      id: input.id,
      slug,
      title: input.title,
      body: input.body,
      createdAt: input.createdAt,
      visibility: 'private',
      imageIds: input.imageIds,
      ...(input.video ? { video: input.video } : {}),
      kind: input.kind ?? 'diary',
      tags: input.tags ?? [],
      fields: input.fields ?? {},
      starred: input.starred ?? false,
    }
    return { ...p, posts: [post, ...p.posts] }
  }

export type PostPatch = {
  title?: string
  body?: string
  imageIds?: string[]
  video?: VideoEmbed | null
  kind?: PostKind
  tags?: string[]
  fields?: Post['fields']
  starred?: boolean
}

/** Slug never changes after creation, so public URLs stay stable. */
export const updatePost =
  (id: string, patch: PostPatch): Command =>
  (p) =>
    collectGarbage({
      ...p,
      posts: p.posts.map((post) => {
        if (post.id !== id) return post
        const { video: _v, ...rest } = post
        const video = patch.video === undefined ? post.video : patch.video ?? undefined
        return {
          ...rest,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.imageIds !== undefined ? { imageIds: patch.imageIds } : {}),
          ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          ...(patch.fields !== undefined ? { fields: patch.fields } : {}),
          ...(patch.starred !== undefined ? { starred: patch.starred } : {}),
          ...(video ? { video } : {}),
        }
      }),
    })

/** Batch operations on several records at once (Life Archive selection). Each is one undoable change. */
export const setManyVisibility =
  (ids: readonly string[], visibility: Post['visibility']): Command =>
  (p) => {
    assertShareable(p, ids, visibility)
    const set = new Set(ids)
    return { ...p, posts: p.posts.map((post) => (set.has(post.id) ? { ...post, visibility } : post)) }
  }

export const addTagToMany =
  (ids: readonly string[], tag: string): Command =>
  (p) => {
    const set = new Set(ids)
    return { ...p, posts: p.posts.map((post) => (set.has(post.id) && !post.tags.includes(tag) && post.tags.length < 12 ? { ...post, tags: [...post.tags, tag] } : post)) }
  }

export const deleteMany =
  (ids: readonly string[]): Command =>
  (p) => ids.reduce((acc, id) => deletePost(id)(acc), p)

export const toggleStar =
  (id: string): Command =>
  (p) => ({ ...p, posts: p.posts.map((post) => (post.id === id ? { ...post, starred: !post.starred } : post)) })

/** A gift from someone else may become public only if the sender allowed it. */
function assertShareable(p: Project, ids: readonly string[], visibility: Post['visibility']): void {
  if (visibility !== 'public') return
  for (const id of ids) {
    const post = p.posts.find((x) => x.id === id)
    if (post?.kind === 'gift' && !p.gifts.some((g) => g.postId === id && g.shareable)) {
      throw new Error('This gift came from a friend who did not allow sharing it publicly')
    }
  }
}

export const setVisibility =
  (id: string, visibility: Post['visibility']): Command =>
  (p) => {
    assertShareable(p, [id], visibility)
    return { ...p, posts: p.posts.map((post) => (post.id === id ? { ...post, visibility } : post)) }
  }

/** Website components keep pointing at content; a deleted entry simply drops out of them. */
function forgetPost(d: SiteDesign, id: string): SiteDesign {
  return {
    ...d,
    widgets: d.widgets.map((w) =>
      w.content.type === 'diary' && w.content.postIds.includes(id)
        ? { ...w, content: { ...w.content, postIds: w.content.postIds.filter((x) => x !== id) } }
        : w,
    ),
  }
}

export const deletePost =
  (id: string): Command =>
  (p) =>
    collectGarbage({
      ...p,
      posts: p.posts.filter((post) => post.id !== id),
      gifts: p.gifts.filter((g) => g.postId !== id),
      web: {
        ...p.web,
        draft: forgetPost(p.web.draft, id),
        ...(p.web.published ? { published: { ...p.web.published, design: forgetPost(p.web.published.design, id) } } : {}),
      },
      // A memory object lives and dies with its entry.
      room: { ...p.room, memory: p.room.memory.filter((m) => m.postId !== id) },
    })

// ------------------------------------------------------------------ gifts

export type NewGift = {
  postId: string
  giftId: string
  assetId: string
  png: Uint8Array
  mailId?: string
  from: string
  fromTitle: string
  receivedAt: string
  shareable: boolean
  letter: Gift['letter']
  title: string
  body: string
  slug?: string
}

/**
 * Keeps a received letter: one private Life Archive record (kind gift, cover = the letter as a picture) plus the
 * letter itself. Keeping the same server message twice does nothing. Nothing is ever made public here.
 */
export const keepGift =
  (g: NewGift): Command =>
  (p) => {
    if (g.mailId && p.gifts.some((x) => x.mailId === g.mailId)) return p
    return compose(
      addAsset({ id: g.assetId, mime: 'image/png', data: g.png }),
      addPost({
        id: g.postId,
        createdAt: g.receivedAt,
        title: g.title,
        body: g.body,
        imageIds: [g.assetId],
        kind: 'gift',
        fields: { sender: g.fromTitle || g.from },
        tags: ['gift'],
      }),
      (q) => ({
        ...q,
        gifts: [...q.gifts, { id: g.giftId, postId: g.postId, ...(g.mailId ? { mailId: g.mailId } : {}), from: g.from, receivedAt: g.receivedAt, shareable: g.shareable, letter: g.letter }],
      }),
    )(p)
  }

// ------------------------------------------------------------------ website design (Web Atelier)

/** Runs a design operation on the DRAFT. Visitors keep seeing the published snapshot. */
export const design =
  (op: DesignOp): Command =>
  (p) =>
    collectGarbage({ ...p, web: { ...p.web, draft: op(p.web.draft) } })

/** Replaces the whole draft (undo / redo). */
export const setDraft =
  (draft: SiteDesign): Command =>
  (p) =>
    collectGarbage({ ...p, web: { ...p.web, draft } })

/** Publishing freezes the current draft as the snapshot that is built for visitors and exports. */
export const publishDraft =
  (at: string): Command =>
  (p) => ({ ...p, web: { ...p.web, published: { design: structuredClone(p.web.draft), at } } })

/** Throws away draft changes and goes back to what is published. */
export const revertDraft: Command = (p) =>
  p.web.published ? collectGarbage({ ...p, web: { ...p.web, draft: structuredClone(p.web.published.design) } }) : p

export const setGuestbookSnapshot =
  (notes: GuestNote[]): Command =>
  (p) => ({ ...p, web: { ...p.web, guestbook: notes.slice(0, 100) } })

// ------------------------------------------------------------------ links

/** Accepts what people paste ("friend.example", "https://…") and returns a canonical URL. */
export function normalizeUserUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null
    // Friend links must be reachable by visitors, so bare hostnames are refused.
    if (!u.hostname.includes('.')) return null
    return u.href
  } catch {
    return null
  }
}

export const addLink =
  (link: Link): Command =>
  (p) => ({ ...p, links: [...p.links, link] })

export const deleteLink =
  (id: string): Command =>
  (p) => collectGarbage({ ...p, links: p.links.filter((l) => l.id !== id) })

export const moveLink =
  (id: string, delta: -1 | 1): Command =>
  (p) => {
    const i = p.links.findIndex((l) => l.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= p.links.length) return p
    const links = [...p.links]
    ;[links[i], links[j]] = [links[j]!, links[i]!]
    return { ...p, links }
  }

export const setWebring =
  (ring: Project['webring']): Command =>
  (p) => {
    const clean: Project['webring'] = {}
    for (const key of ['prev', 'next', 'random', 'hub'] as const) {
      const v = ring[key]
      if (v) clean[key] = v
    }
    return { ...p, webring: clean }
  }

// ------------------------------------------------------------------ voice time capsule

export type NewRecordingInput = Omit<Recording, 'visibility'>

/** New recordings are ALWAYS private (voice spec, Requirement 2.1). */
export const addRecording =
  (input: NewRecordingInput): Command =>
  (p) => ({ ...p, recordings: [{ ...input, visibility: 'private' }, ...p.recordings] })

export const updateRecording =
  (id: string, patch: { title?: string; openOn?: string | null }): Command =>
  (p) => ({
    ...p,
    recordings: p.recordings.map((r) => {
      if (r.id !== id) return r
      const { openOn: _o, ...rest } = r
      const openOn = patch.openOn === undefined ? r.openOn : patch.openOn ?? undefined
      return { ...rest, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(openOn ? { openOn } : {}) }
    }),
  })

export const setRecordingVisibility =
  (id: string, visibility: Recording['visibility']): Command =>
  (p) => ({ ...p, recordings: p.recordings.map((r) => (r.id === id ? { ...r, visibility } : r)) })

export const deleteRecording =
  (id: string): Command =>
  (p) => {
    const { welcomeRecordingId, ...room } = p.room
    return {
      ...p,
      recordings: p.recordings.filter((r) => r.id !== id),
      room: welcomeRecordingId === id ? room : p.room,
    }
  }

// ------------------------------------------------------------------ room

export const updateRoomSkin =
  (patch: Partial<Pick<Room, 'house' | 'wall' | 'floor' | 'light'>>): Command =>
  (p) => ({ ...p, room: { ...p.room, ...patch } })

/** Puts a new decor item on the first free floor cell. Throws when the room is full. */
export const addDecor =
  (id: string, kind: DecorKind): Command =>
  (p) => {
    if (p.room.decor.length >= MAX_DECOR) throw new Error('The room is full')
    if (p.room.decor.some((d) => d.id === id)) throw new Error('Duplicate id')
    const spot = firstFreeCell(p.room)
    if (!spot) throw new Error('No free floor space')
    const decor = [...p.room.decor, { id, kind, x: spot[0], z: spot[1], rot: 0 }]
    return { ...p, room: { ...p.room, decor } }
  }

export const moveDecor =
  (id: string, x: number, z: number): Command =>
  (p) => {
    const why = canPlaceDecor(p.room, id, x, z)
    if (why) throw new Error(`Cannot place here (${why})`)
    return { ...p, room: { ...p.room, decor: p.room.decor.map((d) => (d.id === id ? { ...d, x, z } : d)) } }
  }

export const rotateDecor =
  (id: string): Command =>
  (p) => ({
    ...p,
    room: { ...p.room, decor: p.room.decor.map((d) => (d.id === id ? { ...d, rot: (d.rot + 1) % 4 } : d)) },
  })

export const removeDecor =
  (id: string): Command =>
  (p) => ({ ...p, room: { ...p.room, decor: p.room.decor.filter((d) => d.id !== id) } })

/**
 * The owner's choice of object for an entry (or none). Replaces any earlier object of the entry,
 * keeping its slot when the new kind may sit there. Throws when no slot is free.
 */
export const setPostObject =
  (postId: string, kind: MemoryKind | null, objectId: string): Command =>
  (p) => {
    if (!p.posts.some((x) => x.id === postId)) throw new Error('No such entry')
    const old = p.room.memory.find((m) => m.postId === postId)
    const rest = p.room.memory.filter((m) => m.postId !== postId)
    if (kind === null) return { ...p, room: { ...p.room, memory: rest } }
    if (old?.kind === kind) return p
    const base = { ...p.room, memory: rest }
    const keep = old && freeSlotsFor(base, kind).includes(old.slot) ? old.slot : undefined
    const slot = keep ?? autoSlot(base, kind)
    if (!slot) throw new Error('There is no free spot for that object')
    const newId = old?.id ?? objectId
    if (rest.some((m) => m.id === newId)) throw new Error('Duplicate id')
    return { ...p, room: { ...base, memory: [...rest, { id: newId, kind, postId, slot }] } }
  }

export const placeGiftFrame = (postId: string, group: 'wall' | 'desk' | 'shelf' | 'cabinet', id: string): Command => (p) => {
  if (!p.gifts.some(g => g.postId === postId)) throw new Error('Gift must be saved first')
  const slot = freeSlotsFor(p.room, 'photo').find(s => s.startsWith(group + '-'))
  if (!slot) throw new Error('No free space here')
  const memory = [...p.room.memory, { id, kind: 'photo' as const, postId, slot }]
  return { ...p, room: { ...p.room, memory } }
}

export const removePlacement = (id: string): Command => p => ({
  ...p, room: { ...p.room, memory: p.room.memory.filter(m => m.id !== id) },
})

export const moveMemoryObject =
  (id: string, slot: string): Command =>
  (p) => {
    const m = p.room.memory.find((x) => x.id === id)
    if (!m) return p
    if (!freeSlotsFor(p.room, m.kind, id).includes(slot)) throw new Error('That spot is not free')
    return { ...p, room: { ...p.room, memory: p.room.memory.map((x) => (x.id === id ? { ...x, slot } : x)) } }
  }

export const setWelcome =
  (recordingId: string | null): Command =>
  (p) => {
    if (recordingId !== null && !p.recordings.some((r) => r.id === recordingId)) {
      throw new Error('No such recording')
    }
    const { welcomeRecordingId: _w, ...room } = p.room
    return { ...p, room: recordingId === null ? room : { ...room, welcomeRecordingId: recordingId } }
  }
