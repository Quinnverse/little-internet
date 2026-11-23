// Pure editor commands. Every data change in the UI goes through one of these and is
// then validated by `parseProject` in the store (Requirement 3.1).
import {
  firstFreeSpot,
  moveBlock,
  placeBlock,
  removeBlock,
  resizeBlock,
} from '../core/layout.ts'
import type {
  Asset,
  Block,
  BlockContent,
  GHOST_COLORS,
  Lang,
  Link,
  Post,
  Project,
  Recording,
  Theme,
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
  theme: Theme
  ghostName: string
  ghostColor: (typeof GHOST_COLORS)[number]
}

/** A new home is never empty: latest entries, the ghost's spot, and friends. */
export function createProject(input: NewProjectInput, blockIds: [string, string, string]): Project {
  return {
    schemaVersion: 1,
    site: { slug: input.slug, title: input.title, tagline: '', theme: input.theme, lang: input.lang ?? 'en' },
    ghost: { enabled: true, name: input.ghostName, color: input.ghostColor },
    blocks: [
      { id: blockIds[0], x: 0, y: 0, w: 2, h: 2, content: { kind: 'latest' } },
      { id: blockIds[1], x: 2, y: 0, w: 2, h: 1, content: { kind: 'ghost-home' } },
      { id: blockIds[2], x: 2, y: 1, w: 2, h: 1, content: { kind: 'links' } },
    ],
    posts: [],
    links: [],
    webring: {},
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

/** Removes images that no post and no block uses any more. */
export const collectGarbage: Command = (p) => {
  const used = new Set<string>()
  for (const post of p.posts) post.imageIds.forEach((id) => used.add(id))
  for (const b of p.blocks) if (b.content.kind === 'image') used.add(b.content.assetId)
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
    }
    return { ...p, posts: [post, ...p.posts] }
  }

export type PostPatch = {
  title?: string
  body?: string
  imageIds?: string[]
  video?: VideoEmbed | null
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
          ...(video ? { video } : {}),
        }
      }),
    })

export const setVisibility =
  (id: string, visibility: Post['visibility']): Command =>
  (p) => ({ ...p, posts: p.posts.map((post) => (post.id === id ? { ...post, visibility } : post)) })

export const deletePost =
  (id: string): Command =>
  (p) =>
    collectGarbage({
      ...p,
      posts: p.posts.filter((post) => post.id !== id),
      blocks: p.blocks.filter((b) => !(b.content.kind === 'post' && b.content.postId === id)),
      // A memory object lives and dies with its entry.
      room: { ...p.room, memory: p.room.memory.filter((m) => m.postId !== id) },
    })

// ------------------------------------------------------------------ blocks

export type BlockSize = { w: Block['w']; h: Block['h'] }

export const addBlock =
  (id: string, content: BlockContent, size: BlockSize): Command =>
  (p) => {
    const { x, y } = firstFreeSpot(p.blocks, size.w, size.h)
    return { ...p, blocks: placeBlock(p.blocks, { id, x, y, ...size, content }) }
  }

export const moveBlockTo =
  (id: string, x: number, y: number): Command =>
  (p) => ({ ...p, blocks: moveBlock(p.blocks, id, x, y) })

export const resizeBlockTo =
  (id: string, size: BlockSize): Command =>
  (p) => ({ ...p, blocks: resizeBlock(p.blocks, id, size.w, size.h) })

export const deleteBlock =
  (id: string): Command =>
  (p) => collectGarbage({ ...p, blocks: removeBlock(p.blocks, id) })

export const setBlockText =
  (id: string, text: string): Command =>
  (p) => ({
    ...p,
    blocks: p.blocks.map((b) => (b.id === id && b.content.kind === 'text' ? { ...b, content: { kind: 'text', text } } : b)),
  })

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
  (p) => ({ ...p, links: p.links.filter((l) => l.id !== id) })

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
