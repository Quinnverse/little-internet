import { z } from 'zod'
import { publicProjection } from './privacy.ts'
import {
  AUDIO_MIMES,
  IMAGE_MIMES,
  ProjectSchema,
  SITE_SLUG_PATTERN,
  StoredProjectSchema,
  describe,
  type Project,
  type Result,
} from './schema.ts'
import { fromStored, toStored } from './storage.ts'

/**
 * Publishing protocol shared by the browser and the Node publish server.
 *
 * Transport shape: a ZIP-free JSON envelope. Media bytes travel as base64 in a
 * `media` map keyed by the exact relative path that the stored project already
 * references (`assets/<id>.<ext>`, `audio/<id>.<ext>`). The server decodes it,
 * re-validates with the SAME zod schemas used for import, then renders with the
 * SAME `generateSite` used for static export. There is no second renderer.
 *
 * Security posture: the payload is treated as hostile. The envelope is strict
 * (unknown top-level keys are rejected), media keys must match referenced paths
 * exactly, MIME types are an allow-list, byte counts are bounded, and the
 * username is validated against a reserved-word list.
 */

/** Usernames that would collide with platform routes or are confusing/reserved. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'www', 'api', 'app', 'admin', 'static', 'assets', 'audio', 'posts', 'health',
  'healthz', 'favicon', 'manifest', 'robots', 'sitemap', 'login', 'logout',
  'signup', 'signin', 'account', 'me', 'root', 'system', 'support', 'help',
  'about', 'privacy', 'terms', 'legal', 'mail', 'cdn', 'img', 'images', 'css',
  'js', 'test', 'staging', 'dev', 'beta', 'status', 'nothing', 'null', 'undefined',
])

export const PUBLISH_LIMITS = {
  /** Max decoded bytes for a single image asset. */
  maxAssetBytes: 10 * 1024 * 1024,
  /** Max decoded bytes for a single recording (matches core schema, 5 MB). */
  maxRecordingBytes: 5 * 1024 * 1024,
  /** Max sum of all decoded media bytes in one request. */
  maxTotalMediaBytes: 40 * 1024 * 1024,
  /** Max raw HTTP request body (base64 adds ~33% overhead, plus JSON). */
  maxRequestBytes: 64 * 1024 * 1024,
  /** Max length of the base64url site token. */
  maxTokenLength: 200,
  /** Min length of the base64url site token (32 random bytes => 43 chars). */
  minTokenLength: 43,
} as const

export type UsernameResult = { ok: true; value: string } | { ok: false; reason: string }

/** Lowercases and validates a handle. Returns a canonical lowercase username. */
export function validateUsername(input: unknown): UsernameResult {
  if (typeof input !== 'string') return { ok: false, reason: 'Username must be text.' }
  const value = input.trim().toLowerCase()
  if (value.length < 2 || value.length > 31) {
    return { ok: false, reason: 'Username must be 2–31 characters.' }
  }
  if (!SITE_SLUG_PATTERN.test(value)) {
    return { ok: false, reason: 'Use lowercase letters, numbers and hyphens only (no leading/trailing hyphen).' }
  }
  if (RESERVED_USERNAMES.has(value)) {
    return { ok: false, reason: 'That username is reserved.' }
  }
  return { ok: true, value }
}

/** base64url site token: 32 random bytes encoded without padding => 43 chars. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,200}$/

export function validateToken(input: unknown): input is string {
  return typeof input === 'string' && TOKEN_PATTERN.test(input)
}

const base64 = z.string().refine(
  (s) => s.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(s),
  'invalid base64',
)

/** Strict envelope: any extra top-level key is rejected. */
export const PublishEnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    username: z.string(),
    project: StoredProjectSchema,
    media: z.record(z.string(), base64).refine((m) => Object.keys(m).length <= 520, 'too many media files'),
  })

export type PublishEnvelope = z.infer<typeof PublishEnvelopeSchema>

/** Builds a publish envelope from a full Project. Only the PUBLIC projection leaves the device. */
export function buildPublishEnvelope(username: string, project: Project): PublishEnvelope {
  const { stored, files } = toStored(publicProjection(project))
  const media: Record<string, string> = {}
  for (const [path, bytes] of files) media[path] = toBase64(bytes)
  return { schemaVersion: 1, username, project: stored, media }
}

export type DecodedPublish = { username: string; project: Project; declaredPaths: string[] }

/**
 * Validates and decodes an untrusted publish envelope. Rejects: bad envelope,
 * bad/reserved username, extra or missing media keys, wrong MIME, oversized
 * media, and anything the core zod schemas reject. Never writes to disk.
 */
export function decodePublishEnvelope(input: unknown): Result<DecodedPublish> {
  const env = PublishEnvelopeSchema.safeParse(input)
  if (!env.success) return { ok: false, reason: `Invalid publish request: ${describe(env.error)}` }

  const name = validateUsername(env.data.username)
  if (!name.ok) return name

  const stored = env.data.project
  const declaredPaths = [
    ...stored.assets.map((a) => a.path),
    ...stored.recordings.map((r) => r.path),
  ]
  const media = env.data.media
  const mediaKeys = Object.keys(media)

  // Exactly the referenced set — rejects smuggled files and missing ones.
  if (mediaKeys.length !== declaredPaths.length) {
    return { ok: false, reason: 'Media file count does not match the site manifest.' }
  }
  const declared = new Set(declaredPaths)
  for (const k of mediaKeys) {
    if (!declared.has(k)) return { ok: false, reason: `Unexpected media file: ${k}` }
  }

  const imageMimes = new Set<string>(IMAGE_MIMES)
  const audioMimes = new Set<string>(AUDIO_MIMES)
  const assetByPath = new Map(stored.assets.map((a) => [a.path, a.mime]))
  const recByPath = new Map(stored.recordings.map((r) => [r.path, r.mime]))

  const files = new Map<string, Uint8Array>()
  let total = 0
  for (const [path, b64] of Object.entries(media)) {
    const bytes = fromBase64(b64)
    if (!bytes) return { ok: false, reason: `Media file ${path} is not valid base64.` }
    total += bytes.byteLength
    if (total > PUBLISH_LIMITS.maxTotalMediaBytes) {
      return { ok: false, reason: 'Total media size exceeds the limit.' }
    }
    const assetMime = assetByPath.get(path)
    const recMime = recByPath.get(path)
    if (assetMime !== undefined && imageMimes.has(assetMime)) {
      if (bytes.byteLength > PUBLISH_LIMITS.maxAssetBytes) {
        return { ok: false, reason: `Image ${path} is too large.` }
      }
    } else if (recMime !== undefined && audioMimes.has(recMime)) {
      if (bytes.byteLength > PUBLISH_LIMITS.maxRecordingBytes) {
        return { ok: false, reason: `Recording ${path} is too large.` }
      }
    } else {
      return { ok: false, reason: `Media file ${path} has an unknown type.` }
    }
    files.set(path, bytes)
  }

  const rebuilt = fromStored(stored, files)
  if (typeof rebuilt === 'string') return { ok: false, reason: rebuilt }

  const checked = ProjectSchema.safeParse(rebuilt)
  if (!checked.success) return { ok: false, reason: `Invalid site data: ${describe(checked.error)}` }

  return { ok: true, value: { username: name.value, project: checked.data, declaredPaths } }
}

// -- base64 helpers (work in both the browser and Node) -----------------------

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(s)
}

export function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}
