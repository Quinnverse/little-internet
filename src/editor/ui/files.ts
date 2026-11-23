import { restoreBackup } from '../../core/backup.ts'
import { importSite } from '../../core/exportZip.ts'
import type { Project, Result } from '../../core/schema.ts'
import { pickFiles, readFileBytes } from '../download.ts'

/** Lets the owner pick a site ZIP or a private backup and parses it. Null if cancelled. */
export async function pickProjectFile(kind: 'site' | 'backup'): Promise<Result<Project> | null> {
  const [file] = await pickFiles('.zip,application/zip')
  if (!file) return null
  const bytes = await readFileBytes(file)
  return kind === 'site' ? importSite(bytes) : restoreBackup(bytes)
}

export function describeProject(p: Project): string {
  const priv = p.posts.filter((x) => x.visibility === 'private').length
  return `“${p.site.title}” — ${p.posts.length} entries (${priv} private), ${p.assets.length} photos`
}
