export function hashToken(token: string, salt: string): string
export class SiteStore {
  constructor(root: string, tokenSalt: string)
  init(): Promise<void>
  verifyOwner(username: string, token: string): Promise<boolean>
  exists(username: string): Promise<boolean>
  publish(username: string, token: string, files: Map<string, Uint8Array>): Promise<{ status: 'created' | 'updated' }>
  unpublish(username: string, token: string): Promise<boolean>
  readSiteFile(username: string, relPath: string): Promise<{ bytes: Uint8Array; etag: string } | null>
  list(): Promise<string[]>
}
export const SAFE_SITE_FILE: RegExp
