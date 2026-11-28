import roomRuntime from '../runtime/room.bundle.js?raw'
import { buildSiteFiles, type GenerateOptions } from './siteFiles.ts'
import type {Project} from './schema.ts'

export {CSP, pagePath, buttonFile, renderPreviewPage, type SiteFiles, type GenerateOptions} from './siteFiles.ts'

export function generateSite(project:Project, opts:GenerateOptions={}) {
  return buildSiteFiles(project,roomRuntime,opts)
}
