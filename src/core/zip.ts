import { unzipSync, zipSync, type Zippable } from 'fflate'
import { normalize } from './normalize.ts'
import { describe, ProjectSchema, StoredProjectSchema, type Project, type Result } from './schema.ts'
import { fromStored } from './storage.ts'

export const LIMITS = {
  maxZipBytes: 50 * 1024 * 1024,
  maxEntries: 2000,
  maxManifestBytes: 10 * 1024 * 1024,
  maxAssetBytes: 15 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
}

// Fixed timestamp so the same files always produce the same ZIP bytes.
const FIXED_MTIME = new Date(Date.UTC(2000, 0, 1, 12, 0, 0))

export function zipFiles(files: Map<string, Uint8Array>): Uint8Array {
  const entries: Zippable = {}
  for (const [path, data] of files) entries[path] = [data, { mtime: FIXED_MTIME }]
  return zipSync(entries, { level: 6 })
}

function isUnsafePath(name: string): boolean {
  return (
    name.startsWith('/') ||
    name.includes('\\') ||
    /^[A-Za-z]:/.test(name) ||
    name.split('/').some((seg) => seg === '..')
  )
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })

/**
 * Reads a Little Internet ZIP: validates every entry name, reads only the manifest,
 * then reads only the asset files the manifest references.
 */
export function readProjectZip(
  bytes: Uint8Array,
  manifestName: string,
  unwrap: (json: unknown) => unknown,
): Result<Project> {
  if (bytes.byteLength > LIMITS.maxZipBytes) return fail('File is larger than 50 MB.')

  const names: string[] = []
  let manifest: Uint8Array | undefined
  try {
    const out = unzipSync(bytes, {
      filter: (f) => {
        names.push(f.name)
        return f.name === manifestName && f.originalSize <= LIMITS.maxManifestBytes
      },
    })
    manifest = out[manifestName]
  } catch {
    return fail('This file is not a readable ZIP.')
  }

  if (names.length > LIMITS.maxEntries) return fail('ZIP has too many files.')
  const bad = names.find(isUnsafePath)
  if (bad !== undefined) return fail(`ZIP contains an unsafe path: ${bad}`)
  if (!manifest) {
    return fail(
      names.includes(manifestName)
        ? `${manifestName} is too large.`
        : `This ZIP has no ${manifestName}, so it is not the expected Little Internet file.`,
    )
  }
  if (manifest.byteLength > LIMITS.maxManifestBytes) return fail(`${manifestName} is too large.`)

  let json: unknown
  try {
    json = unwrap(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifest)))
  } catch {
    return fail(`${manifestName} is not valid JSON.`)
  }
  if (json === undefined) return fail(`${manifestName} is not the expected kind of file.`)

  const stored = StoredProjectSchema.safeParse(json)
  if (!stored.success) return fail(`${manifestName} is invalid: ${describe(stored.error)}`)

  const wanted = new Set([...stored.data.assets.map((a) => a.path), ...stored.data.recordings.map((r) => r.path)])
  let declaredTotal = 0
  let tooBig: string | undefined
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (!wanted.has(f.name)) return false
        declaredTotal += f.originalSize
        if (f.originalSize > LIMITS.maxAssetBytes || declaredTotal > LIMITS.maxTotalBytes) {
          tooBig = f.name
          return false
        }
        return true
      },
    })
  } catch {
    return fail('Could not read files from the ZIP.')
  }
  if (tooBig) return fail(`File is too large: ${tooBig}`)
  const assetFiles = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(files)) {
    if (data.byteLength > LIMITS.maxAssetBytes) return fail(`File is too large: ${name}`)
    assetFiles.set(name, data)
  }

  const project = fromStored(stored.data, assetFiles)
  if (typeof project === 'string') return fail(project)
  const checked = ProjectSchema.safeParse(project)
  if (!checked.success) return fail(describe(checked.error))
  return { ok: true, value: normalize(checked.data) }
}
