import { assetPath, recordingPath, type Project, type StoredProject } from './schema.ts'

/** Splits a Project into its JSON form (assets as paths) and the asset files. */
export function toStored(p: Project): { stored: StoredProject; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  const assets = p.assets.map((a) => {
    const path = assetPath(a.id, a.mime)
    files.set(path, a.data)
    return { id: a.id, mime: a.mime, path }
  })
  const recordings = p.recordings.map(({ data, ...meta }) => {
    const path = recordingPath(meta.id, meta.mime)
    files.set(path, data)
    return { ...meta, path }
  })
  const stored: StoredProject = {
    schemaVersion: p.schemaVersion,
    site: p.site,
    ghost: p.ghost,
    web: p.web,
    ...(p.privateHome?{privateHome:p.privateHome}:{}),
    gifts: p.gifts,
    posts: p.posts,
    links: p.links,
    webring: p.webring,
    room: p.room,
    assets,
    recordings,
  }
  return { stored, files }
}

export function fromStored(stored: StoredProject, files: Map<string, Uint8Array>): Project | string {
  const assets = []
  for (const a of stored.assets) {
    const data = files.get(a.path)
    if (!data) return `missing image file ${a.path}`
    assets.push({ id: a.id, mime: a.mime, data })
  }
  const recordings = []
  for (const { path, ...meta } of stored.recordings) {
    const data = files.get(path)
    if (!data) return `missing recording file ${path}`
    recordings.push({ ...meta, data })
  }
  const { assets: _a, recordings: _r, ...rest } = stored
  return { ...rest, assets, recordings }
}
