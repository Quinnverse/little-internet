import { assetPath, type Project, type StoredProject } from './schema.ts'

/** Splits a Project into its JSON form (assets as paths) and the asset files. */
export function toStored(p: Project): { stored: StoredProject; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  const assets = p.assets.map((a) => {
    const path = assetPath(a.id, a.mime)
    files.set(path, a.data)
    return { id: a.id, mime: a.mime, path }
  })
  const stored: StoredProject = {
    schemaVersion: p.schemaVersion,
    site: p.site,
    ghost: p.ghost,
    blocks: p.blocks,
    posts: p.posts,
    links: p.links,
    webring: p.webring,
    assets,
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
  const { assets: _ignored, ...rest } = stored
  return { ...rest, assets }
}
