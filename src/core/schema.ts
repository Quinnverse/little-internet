import { z } from 'zod'
import { isValidLayout, SIZE_PRESETS } from './layout.ts'
import { defaultRoom, migrateRoomInput, RoomSchema, roomIssues, type Room } from './room.ts'

/** Ids are safe in file names, CSS class names and selectors without escaping. */
export const ID_PATTERN = /^[a-z0-9_-]{1,40}$/
export const SITE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
export const POST_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
export const VIMEO_ID_PATTERN = /^[0-9]{1,12}$/
export const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export const THEMES = ['paper', 'midnight', 'room'] as const
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

// Characters that are invalid in XML 1.0 or that do not survive UTF-8 round trips.
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
const LINE_BREAKS = /[\n\r\t\u2028\u2029]/

export function isSafeText(s: string): boolean {
  return !FORBIDDEN_CHARS.test(s) && !LONE_SURROGATE.test(s)
}

export function isSafeLine(s: string): boolean {
  return isSafeText(s) && !LINE_BREAKS.test(s)
}

/** Canonical http(s) URL with no embedded credentials. */
export function isCanonicalHttpUrl(s: string): boolean {
  if (s.length > 2048) return false
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return false
  }
  return (
    (u.protocol === 'http:' || u.protocol === 'https:') &&
    u.username === '' &&
    u.password === '' &&
    u.href === s
  )
}

const line = (max: number) =>
  z.string().max(max).refine(isSafeLine, 'contains characters that are not allowed')
const text = (max: number) =>
  z.string().max(max).refine(isSafeText, 'contains characters that are not allowed')
const id = z.string().regex(ID_PATTERN)
const httpUrl = z.string().refine(isCanonicalHttpUrl, 'must be a plain http(s) URL')

export const VideoSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('youtube'), videoId: z.string().regex(YOUTUBE_ID_PATTERN) }),
  z.object({ provider: z.literal('vimeo'), videoId: z.string().regex(VIMEO_ID_PATTERN) }),
])

export const BlockContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('post'), postId: id }),
  z.object({ kind: z.literal('image'), assetId: id }),
  z.object({ kind: z.literal('text'), text: text(500) }),
  z.object({ kind: z.literal('links') }),
  z.object({ kind: z.literal('latest') }),
  z.object({ kind: z.literal('ghost-home') }),
  z.object({ kind: z.literal('voice') }),
])

export const BlockSchema = z
  .object({
    id,
    x: z.number().int().min(0).max(3),
    y: z.number().int().min(0).max(999),
    w: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    h: z.union([z.literal(1), z.literal(2)]),
    content: BlockContentSchema,
  })
  .refine((b) => SIZE_PRESETS.some(([w, h]) => w === b.w && h === b.h), 'size is not a preset')

export const PostSchema = z.object({
  id,
  slug: z.string().regex(POST_SLUG_PATTERN),
  title: line(120),
  body: text(20_000),
  createdAt: z
    .string()
    .regex(ISO_UTC_PATTERN)
    .refine((s) => new Date(s).toISOString() === s, 'invalid date'),
  visibility: z.enum(['public', 'private']),
  imageIds: z.array(id).max(12),
  video: VideoSchema.optional(),
})

export const LinkSchema = z.object({ id, title: line(80), url: httpUrl })

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
  // 'meadow' was replaced by the room skin; old saves keep working.
  theme: z.preprocess((v) => (v === 'meadow' ? 'room' : v), z.enum(THEMES)),
  // Added with the 3D home: older saves have no language and load as English.
  lang: z.enum(LANGS).default('en'),
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

const isoDate = z
  .string()
  .regex(ISO_UTC_PATTERN)
  .refine((s) => new Date(s).toISOString() === s, 'invalid date')

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

const ProjectShape = {
  schemaVersion: z.literal(1),
  site: SiteSettingsSchema,
  ghost: GhostSettingsSchema,
  blocks: z.array(BlockSchema).max(200),
  posts: z.array(PostSchema).max(2000),
  links: z.array(LinkSchema).max(100),
  webring: WebringSchema,
  // Added with the 3D home: older saves have no room and load with the default one.
  room: z.preprocess(migrateRoomInput, RoomSchema).default(() => defaultRoom()),
}

type Refinable = {
  room: Room
  recordings: { id: string }[]
  blocks: z.infer<typeof BlockSchema>[]
  posts: z.infer<typeof PostSchema>[]
  links: z.infer<typeof LinkSchema>[]
  assets: { id: string }[]
}

function checkReferences(p: Refinable, ctx: z.RefinementCtx): void {
  const dup = (label: string, values: string[]) => {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: 'custom', message: `duplicate ${label}` })
    }
  }
  dup('block id', p.blocks.map((b) => b.id))
  dup('post id', p.posts.map((x) => x.id))
  dup('post slug', p.posts.map((x) => x.slug))
  dup('link id', p.links.map((l) => l.id))
  dup('asset id', p.assets.map((a) => a.id))
  dup('recording id', p.recordings.map((r) => r.id))

  const postIds = new Set(p.posts.map((x) => x.id))
  const assetIds = new Set(p.assets.map((a) => a.id))
  for (const b of p.blocks) {
    if (b.content.kind === 'post' && !postIds.has(b.content.postId)) {
      ctx.addIssue({ code: 'custom', message: `block ${b.id} points to a missing post` })
    }
    if (b.content.kind === 'image' && !assetIds.has(b.content.assetId)) {
      ctx.addIssue({ code: 'custom', message: `block ${b.id} points to a missing image` })
    }
  }
  for (const post of p.posts) {
    for (const ref of post.imageIds) {
      if (!assetIds.has(ref)) {
        ctx.addIssue({ code: 'custom', message: `post ${post.id} points to a missing image` })
      }
    }
  }
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
  if (!isValidLayout(p.blocks)) {
    ctx.addIssue({ code: 'custom', message: 'blocks overlap or are outside the grid' })
  }
}

export const ProjectSchema = z
  .object({
    ...ProjectShape,
    assets: z.array(AssetSchema).max(500),
    // Added after the first saves: older projects have no field and load as [].
    recordings: z.array(RecordingSchema).max(20).default([]),
  })
  .superRefine(checkReferences)

/** `site.json` / `backup.json` form: assets are file paths instead of bytes. */
export const StoredProjectSchema = z
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
  .superRefine(checkReferences)

export type Project = z.infer<typeof ProjectSchema>
export type StoredProject = z.infer<typeof StoredProjectSchema>
export type Block = z.infer<typeof BlockSchema>
export type BlockContent = z.infer<typeof BlockContentSchema>
export type Post = z.infer<typeof PostSchema>
export type Link = z.infer<typeof LinkSchema>
export type Asset = z.infer<typeof AssetSchema>
export type VideoEmbed = z.infer<typeof VideoSchema>
export type Recording = z.infer<typeof RecordingSchema>
export type Theme = (typeof THEMES)[number]

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
