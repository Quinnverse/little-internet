import { buildPublishEnvelope, type UsernameResult, validateUsername } from '../core/publish.ts'
import type { Project } from '../core/schema.ts'

/**
 * Browser-side publish client.
 *
 * The site token is a per-browser secret stored ONLY in localStorage. It is
 * never added to the Project, site.json, RSS, or the export ZIP. Losing it
 * means losing the ability to update/unpublish — the owner can re-publish under
 * a new name. localStorage survives reloads on the same origin; it is not a
 * cross-device account system (competition scope has no accounts).
 */

const TOKEN_STORAGE_PREFIX = 'little-internet:publish-token:'
const API_STORAGE_KEY = 'little-internet:publish-api'
const DEFAULT_API = import.meta.env?.VITE_PUBLISH_API || 'https://little.quinnverse.tech'

export type PublishResult = { ok: true; url: string; status: 'created' | 'updated' } | { ok: false; reason: string }

function apiBase(): string {
  try {
    return localStorage.getItem(API_STORAGE_KEY) || DEFAULT_API
  } catch {
    return DEFAULT_API
  }
}

export function setApiBase(url: string): void {
  try { localStorage.setItem(API_STORAGE_KEY, url.replace(/\/$/, '')) } catch { /* private mode */ }
}

export function getApiBase(): string {
  return apiBase().replace(/\/$/, '')
}

export function getSiteUrl(username: string): string {
  return `${getApiBase()}/@${username}/`
}

function tokenKey(username: string): string {
  return TOKEN_STORAGE_PREFIX + username
}

/** Returns the stored token for a username, or null. */
export function getToken(username: string): string | null {
  try { return localStorage.getItem(tokenKey(username)) } catch { return null }
}

/** Generates a fresh 32-byte base64url token (43 chars) and stores it. */
export function ensureToken(username: string): string {
  const existing = getToken(username)
  if (existing) return existing
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const token = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  try { localStorage.setItem(tokenKey(username), token) } catch { /* private mode */ }
  return token
}

export function forgetToken(username: string): void {
  try { localStorage.removeItem(tokenKey(username)) } catch { /* private mode */ }
}

/** The username currently bound to this browser, if any. */
export function knownUsername(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(TOKEN_STORAGE_PREFIX)) return k.slice(TOKEN_STORAGE_PREFIX.length)
    }
  } catch { /* private mode */ }
  return null
}

export async function publishSite(usernameInput: string, project: Project): Promise<PublishResult> {
  const name: UsernameResult = validateUsername(usernameInput)
  if (!name.ok) return { ok: false, reason: name.reason }
  const username = name.value
  const token = ensureToken(username)
  const envelope = buildPublishEnvelope(username, project)
  try {
    const res = await fetch(`${getApiBase()}/api/v1/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-token': token },
      body: JSON.stringify(envelope),
    })
    let body: Record<string, unknown> = {}
    try { body = await res.json() } catch { /* ignore */ }
    if (!res.ok) {
      // Keep the generated token only on a real conflict/authorization result;
      // on validation errors we still keep it so retry works, but surface why.
      return { ok: false, reason: typeof body.error === 'string' ? body.error : `Publish failed (${res.status}).` }
    }
    return { ok: true, url: String(body.url || getSiteUrl(username)), status: body.status === 'updated' ? 'updated' : 'created' }
  } catch {
    return { ok: false, reason: 'Could not reach the publish service. Check your connection.' }
  }
}

export type UnpublishResult = { ok: true } | { ok: false; reason: string }

export async function unpublishSite(username: string): Promise<UnpublishResult> {
  const token = getToken(username)
  if (!token) return { ok: false, reason: 'No publish credential stored in this browser.' }
  try {
    const res = await fetch(`${getApiBase()}/api/v1/publish/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { 'x-site-token': token },
    })
    if (res.ok || res.status === 404) {
      forgetToken(username)
      return { ok: true }
    }
    let body: Record<string, unknown> = {}
    try { body = await res.json() } catch { /* ignore */ }
    return { ok: false, reason: typeof body.error === 'string' ? body.error : `Unpublish failed (${res.status}).` }
  } catch {
    return { ok: false, reason: 'Could not reach the publish service.' }
  }
}
