import { z } from 'zod'
import { FIELD_KEYS, MAX_TAGS, POST_KINDS, TAG_PATTERN } from './archive.ts'
import { LetterSchema } from './letter.ts'
import { designFromLegacy, designIssues, WebStateSchema, type WebState } from './design.ts'
import { defaultRoom, migrateRoomInput, RoomSchema, roomIssues, type Room } from './room.ts'
import { httpUrl, id, isoDate, line, text } from './validators.ts'

export { ID_PATTERN, ISO_UTC_PATTERN, isCanonicalHttpUrl, isSafeLine, isSafeText } from './validators.ts'

export const SCHEMA_VERSION = 2
export const SITE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
export const POST_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
export const VIMEO_ID_PATTERN = /^[0-9]{1,12}$/

export const LANGS = ['en', 'zh'] as const
export type Lang = (typeof LANGS)[number]
export const GHOST_COLORS = ['white', 'mint', 'peach', 'lilac'] as const
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type ImageMime = (typeof IMAGE_MIMES)[number]

export const AUDIO_MIMES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'] as const
export type AudioMime = (typeof AUDIO_MIMES)[number]
export const AUDIO_EXT: Record<AudioMime, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
}
export const MAX_RECORDING_MS = 60_000
export const MAX_RECORDING_BYTES = 5 * 1024 * 1024
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const MIME_EXT: Record<ImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const VideoSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('youtube'), videoId: z.string().regex(YOUTUBE_ID_PATTERN) }),
  z.object({ provider: z.literal('vimeo'), videoId: z.string().regex(VIMEO_ID_PATTERN) }),
])

export const PostSchema = z.object({
  id,
  slug: z.string().regex(POST_SLUG_PATTERN),
  title: line(120),
  body: text(20_000),
  createdAt: isoDate,
  visibility: z.enum(['public', 'private']),
  imageIds: z.array(id).max(12),
  video: VideoSchema.optional(),
  // Life Archive (additive; older saves load as diary entries without tags).
  kind: z.enum(POST_KINDS).default('diary'),
  tags: z.array(z.string().regex(TAG_PATTERN)).max(MAX_TAGS).default([]),
  fields: z.partialRecord(z.enum(FIELD_KEYS), text(1000)).default({}),
  starred: z.boolean().default(false),
})

/**
 * A received gift. The Life Archive record (`postId`, kind 'gift') is what the owner searches, tags, frames and
 * deletes; this holds the letter itself and where it came from. `shareable` is the SENDER's permission: only
 * when it is true may the owner make the gift public (website). Default for any gift is private.
 */
export const GiftSchema = z.object({
  id,
  postId: id,
  /** Server message id this came from (so receiving twice never duplicates). */
  mailId: z.string().regex(/^[0-9a-f-]{36}$/).optional(),
  from: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/),
  receivedAt: isoDate,
  shareable: z.boolean(),
  letter: LetterSchema,
})
export type Gift = z.infer<typeof GiftSchema>

export const LinkSchema = z.object({
  id,
  title: line(80),
  url: httpUrl,
  /** A neighbour's 88×31 badge the owner saved (an image asset). */
  buttonAssetId: id.optional(),
})

export const WebringSchema = z.object({
  prev: httpUrl.optional(),
  next: httpUrl.optional(),
  random: httpUrl.optional(),
  hub: httpUrl.optional(),
})

const SiteSettingsSchema = z.object({
  slug: z.string().regex(SITE_SLUG_PATTERN),
  title: line(80),
  tagline: line(200),
  // Added with the 3D home: older saves have no language and load as English.
  lang: z.enum(LANGS).default('en'),
  /** Marks a sample home made by the Little Internet team. Shown to every visitor. */
  demo: z.boolean().optional(),
})

const GhostSettingsSchema = z.object({
  enabled: z.boolean(),
  name: line(24),
  color: z.enum(GHOST_COLORS),
})

const AssetSchema = z.object({
  id,
  mime: z.enum(IMAGE_MIMES),
  data: z.custom<Uint8Array>((v) => v instanceof Uint8Array, 'must be binary data'),
})

const RecordingBase = {
  id,
  title: line(80),
  createdAt: isoDate,
  visibility: z.enum(['public', 'private']),
  durationMs: z.number().int().min(1).max(MAX_RECORDING_MS),
  mime: z.enum(AUDIO_MIMES),
  openOn: z
    .string()
    .regex(DATE_PATTERN)
    .refine((s) => new Date(`${s}T00:00:00.000Z`).toISOString().slice(0, 10) === s, 'invalid date')
    .optional(),
}

const RecordingSchema = z.object({
  ...RecordingBase,
  data: z.custom<Uint8Array>(
    (v) => v instanceof Uint8Array && v.byteLength > 0 && v.byteLength <= MAX_RECORDING_BYTES,
    'recording must be 1 byte – 5 MB',
  ),
})

const StoredRecordingSchema = z
  .object({ ...RecordingBase, path: z.string() })
  .refine((r) => r.path === recordingPath(r.id, r.mime), 'unexpected recording path')

const WallPinSchema = z.object({
  moment:z.object({name:z.string().max(48),message:z.string().max(240)}).optional(),
  mount:z.enum(['pin','tape']).optional(),
  id, assetId:id.optional(),postId:id.optional(), text:z.string().max(240),
  x:z.number().min(0).max(100),y:z.number().min(0).max(100),
  size:z.number().min(10).max(70),rotation:z.number().min(-180).max(180),
})
export type WallPin=z.infer<typeof WallPinSchema>
const ProjectShape = {
  privateHome:z.object({
    pins:z.array(WallPinSchema).max(150).optional(),
    dates:z.array(z.object({id,day:z.iso.date(),name:z.string().max(100)})).max(200).optional(),
    sign:z.string().max(48).optional(), wish:z.string().max(240).optional(),
    period:z.enum(['auto','morning','afternoon','dusk','midnight']).optional(), lampsOn:z.boolean().optional(),
    outfit:z.enum(['warm','cool','hidden']).optional(),paper:id.optional()
  }).optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  site: SiteSettingsSchema,
  ghost: GhostSettingsSchema,
  /** Web Atelier: the website design (draft and published snapshot). Replaces the v1 block grid. */
  web: WebStateSchema,
  posts: z.array(PostSchema).max(2000),
  links: z.array(LinkSchema).max(100),
  webring: WebringSchema,
  // Heart Mail (V5): received gifts. Older saves have none.
  gifts: z.array(GiftSchema).max(300).default([]),
  // Added with the 3D home: older saves have no room and load with the default one.
  room: z.preprocess(migrateRoomInput, RoomSchema).default(() => defaultRoom()),
}

type Refinable = {
  room: Room
  recordings: { id: string }[]
  web: WebState
  posts: z.infer<typeof PostSchema>[]
  links: z.infer<typeof LinkSchema>[]
  assets: { id: string }[]
  gifts: z.infer<typeof GiftSchema>[]
}

function checkReferences(p: Refinable, ctx: z.RefinementCtx): void {
  const dup = (label: string, values: string[]) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: 'custom', message: `duplicate ${label}` })
    }
  }
  dup('post id', p.posts.map((x) => x.id))
  dup('post slug', p.posts.map((x) => x.slug))
  dup('link id', p.links.map((l) => l.id))
  dup('asset id', p.assets.map((a) => a.id))
  dup('recording id', p.recordings.map((r) => r.id))

  const postIds = new Set(p.posts.map((x) => x.id))
  const assetIds = new Set(p.assets.map((a) => a.id))
  const known = { assetIds, postIds }
  for (const issue of designIssues(p.web.draft, known)) ctx.addIssue({ code: 'custom', message: `website draft: ${issue}` })
  if (p.web.published) {
    for (const issue of designIssues(p.web.published.design, known))
      ctx.addIssue({ code: 'custom', message: `published website: ${issue}` })
  }
  // A website decoration is public by placement, so it may never be one of a diary entry's photos.
  const postImages = new Set(p.posts.flatMap((x) => x.imageIds))
  const decorations = [...p.web.draft.assets, ...(p.web.published?.design.assets ?? [])]
  for (const d of decorations) {
    if (postImages.has(d.id)) ctx.addIssue({ code: 'custom', message: `decoration ${d.id} is also a diary photo` })
  }
  for (const l of p.links) {
    if (l.buttonAssetId && !assetIds.has(l.buttonAssetId))
      ctx.addIssue({ code: 'custom', message: `link ${l.id} points to a missing badge image` })
    if (l.buttonAssetId && postImages.has(l.buttonAssetId))
      ctx.addIssue({ code: 'custom', message: `link ${l.id} badge is also a diary photo` })
  }
  for (const post of p.posts) {
    for (const ref of post.imageIds) {
      if (!assetIds.has(ref)) {
        ctx.addIssue({ code: 'custom', message: `post ${post.id} points to a missing image` })
      }
    }
  }
  // Gifts: unique, tied to a real archive record of kind 'gift', and never public unless the sender allowed it.
  dup('gift id', p.gifts.map((g) => g.id))
  dup('gift record', p.gifts.map((g) => g.postId))
  const postById = new Map(p.posts.map((x) => [x.id, x]))
  for (const g of p.gifts) {
    const post = postById.get(g.postId)
    if (!post) ctx.addIssue({ code: 'custom', message: `gift ${g.id} has no archive record` })
    else if (post.kind !== 'gift') ctx.addIssue({ code: 'custom', message: `gift ${g.id} record is not a gift` })
    else if (post.visibility === 'public' && !g.shareable) ctx.addIssue({ code: 'custom', message: `gift ${g.id} is public but the sender did not allow sharing` })
  }
  for (const x of p.posts) if (x.kind === 'gift' && !p.gifts.some((g) => g.postId === x.id)) ctx.addIssue({ code: 'custom', message: `gift record ${x.id} has no gift` })
  for (const issue of roomIssues(p.room)) ctx.addIssue({ code: 'custom', message: issue })
  for (const m of p.room.memory) {
    if (!postIds.has(m.postId)) {
      ctx.addIssue({ code: 'custom', message: `memory object ${m.id} points to a missing post` })
    }
  }
  const welcome = p.room.welcomeRecordingId
  if (welcome !== undefined && !p.recordings.some((r) => r.id === welcome)) {
    ctx.addIssue({ code: 'custom', message: 'welcome recording is missing' })
  }
}

/**
 * schemaVersion 1 → 2: the 4-column block grid and `site.theme` become a Web Atelier design.
 * Only runs on version-1 input; everything else passes through untouched for zod to judge.
 */
export function migrateProjectInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input
  const o = input as Record<string, unknown>
  if (o.schemaVersion !== 1) return input
  const site = (o.site && typeof o.site === 'object' ? o.site : {}) as Record<string, unknown>
  const { theme, ...siteRest } = site
  const lang = site.lang === 'zh' ? 'zh' : 'en'
  const blocks = Array.isArray(o.blocks) ? o.blocks : []
  const { blocks: _b, ...rest } = o
  const postPhotos = new Map<string, string>()
  if (Array.isArray(o.posts)) {
    for (const post of o.posts as { id?: unknown; imageIds?: unknown }[]) {
      if (!post || typeof post.id !== 'string' || !Array.isArray(post.imageIds)) continue
      for (const img of post.imageIds) if (typeof img === 'string' && !postPhotos.has(img)) postPhotos.set(img, post.id)
    }
  }
  let draft: unknown
  try {
    draft = designFromLegacy({ theme, title: typeof site.title === 'string' ? site.title : '', lang, blocks: blocks as never, postPhotos })
  } catch {
    return input
  }
  return { ...rest, schemaVersion: SCHEMA_VERSION, site: siteRest, web: { draft, guestbook: [] } }
}

export const ProjectSchema = z.preprocess(
  migrateProjectInput,
  z
    .object({
      ...ProjectShape,
      assets: z.array(AssetSchema).max(500),
      // Added after the first saves: older projects have no field and load as [].
      recordings: z.array(RecordingSchema).max(20).default([]),
    })
    .superRefine(checkReferences),
)

/** `site.json` / `backup.json` form: assets are file paths instead of bytes. */
export const StoredProjectSchema = z.preprocess(
  migrateProjectInput,
  z
  .object({
    ...ProjectShape,
    assets: z
      .array(
        z
          .object({ id, mime: z.enum(IMAGE_MIMES), path: z.string() })
          .refine((a) => a.path === assetPath(a.id, a.mime), 'unexpected asset path'),
      )
      .max(500),
    recordings: z.array(StoredRecordingSchema).max(20).default([]),
  })
  .superRefine(checkReferences),
)

export type Project = z.infer<typeof ProjectSchema>
export type StoredProject = z.infer<typeof StoredProjectSchema>
export type Post = z.infer<typeof PostSchema>
export type Link = z.infer<typeof LinkSchema>
export type Asset = z.infer<typeof AssetSchema>
export type VideoEmbed = z.infer<typeof VideoSchema>
export type Recording = z.infer<typeof RecordingSchema>

export function assetPath(id: string, mime: ImageMime): string {
  return `assets/${id}.${MIME_EXT[mime]}`
}

export function recordingPath(id: string, mime: AudioMime): string {
  return `audio/${id}.${AUDIO_EXT[mime]}`
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string }

export function parseProject(input: unknown): Result<Project> {
  const r = ProjectSchema.safeParse(input)
  return r.success ? { ok: true, value: r.data } : { ok: false, reason: describe(r.error) }
}

export function describe(error: z.ZodError): string {
  const first = error.issues[0]
  if (!first) return 'invalid data'
  const where = first.path.length ? ` (at ${first.path.join('.')})` : ''
  return `${first.message}${where}`
}
