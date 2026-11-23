import { generateSite, type GenerateOptions } from './generate.ts'
import type { Project, Result } from './schema.ts'
import { readProjectZip, zipFiles } from './zip.ts'

/**
 * Site export: a deployable ZIP of exactly what `generateSite` produces.
 * Contains the public projection only (generateSite applies it).
 */
export function exportSite(project: Project, opts: GenerateOptions = {}): Uint8Array {
  return zipFiles(generateSite(project, opts))
}

/** Re-imports a site export so it can be edited again. */
export function importSite(bytes: Uint8Array): Result<Project> {
  return readProjectZip(bytes, 'site.json', (json) => json)
}

export function siteExportFileName(project: Project): string {
  return `${project.site.slug}-site.zip`
}
