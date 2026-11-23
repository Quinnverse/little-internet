import { normalize } from './normalize.ts'
import type { Project, Result } from './schema.ts'
import { toStored } from './storage.ts'
import { readProjectZip, zipFiles } from './zip.ts'

const KIND = 'little-internet-backup'
const MANIFEST = 'backup.json'

/**
 * Private backup: the FULL project, including private drafts. Never deploy it.
 * Deliberately separate from `exportSite`; it contains no HTML, so it is not a website.
 */
export function createBackup(project: Project): Uint8Array {
  const { stored, files } = toStored(normalize(project))
  const manifest = new TextEncoder().encode(
    `${JSON.stringify({ kind: KIND, format: 1, project: stored }, null, 2)}\n`,
  )
  return zipFiles(new Map([[MANIFEST, manifest], ...files]))
}

export function restoreBackup(bytes: Uint8Array): Result<Project> {
  return readProjectZip(bytes, MANIFEST, (json) => {
    if (typeof json !== 'object' || json === null) return undefined
    const o = json as Record<string, unknown>
    return o.kind === KIND && o.format === 1 ? o.project : undefined
  })
}

export function backupFileName(project: Project): string {
  return `${project.site.slug}.littleinternet-backup.zip`
}
