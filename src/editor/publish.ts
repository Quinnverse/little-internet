import type { GuestNote } from '../core/design.ts'
import { exportSite } from '../core/exportZip.ts'
import type { Project } from '../core/schema.ts'
import { idbGet, idbSet } from './idb.ts'

/**
 * Client for the small publishing server. Only the public-projection site ZIP is ever sent.
 * The owner's key for a slug is created here, stays in this browser (outside the project and
 * outside every backup), and the server stores only its hash.
 */

const KEYS = 'publish-keys'
const SERVER_PREF = 'li-server'

async function keyFor(slug: string): Promise<string> {
  const all = (await idbGet<Record<string, string>>(KEYS)) ?? {}
  if (all[slug]) return all[slug]!
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const key = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  await idbSet(KEYS, { ...all, [slug]: key })
  return key
}

export const hasKey = async (slug: string) => !!((await idbGet<Record<string, string>>(KEYS)) ?? {})[slug]

/** The server the owner last published to ('' means this app's own origin). */
export function savedServer(): string {
  try {
    return localStorage.getItem(SERVER_PREF) ?? ''
  } catch {
    return ''
  }
}

function rememberServer(server: string) {
  try {
    localStorage.setItem(SERVER_PREF, server.trim())
  } catch {
    /* ignore */
  }
}

export function base(server: string): string {
  const s = server.trim().replace(/\/+$/, '')
  return s || location.origin
}

/** Where a site lives once published. */
export const siteUrl = (slug: string, server: string) => `${base(server)}/@${slug}/`

async function fail(r: Response): Promise<never> {
  let why = `${r.status}`
  try {
    const j = (await r.json()) as { error?: string }
    if (j.error) why = j.error
  } catch {
    /* not JSON */
  }
  throw new Error(why)
}

const auth = async (slug: string) => ({ Authorization: `Bearer ${await keyFor(slug)}` })

/**
 * Uploads the site built from the project's PUBLISHED design (callers run publishDraft first).
 * The base URL makes RSS links and the badge code absolute.
 */
export async function publishSite(p: Project, server: string): Promise<string> {
  const url = siteUrl(p.site.slug, server)
  const zip = exportSite(p, { baseUrl: url })
  const r = await fetch(`${base(server)}/api/sites/${p.site.slug}`, {
    method: 'PUT',
    headers: { ...(await auth(p.site.slug)), 'Content-Type': 'application/zip' },
    body: zip as BodyInit,
  })
  if (!r.ok) return fail(r)
  rememberServer(server)
  const j = (await r.json()) as { path: string }
  return new URL(j.path, base(server)).href
}

export type GuestMessage = { id: string; name: string; text: string; createdAt: string; approved: boolean }

export async function listMessages(slug: string, server: string): Promise<GuestMessage[]> {
  const r = await fetch(`${base(server)}/api/sites/${slug}/messages`, { headers: await auth(slug) })
  if (!r.ok) return fail(r)
  return ((await r.json()) as { messages: GuestMessage[] }).messages
}

/** Approved notes as the public sees them, for the export snapshot. Empty when unreachable. */
export async function approvedNotes(slug: string, server: string): Promise<GuestNote[] | null> {
  try {
    const r = await fetch(`${base(server)}/api/sites/${slug}/messages/approved`, { credentials: 'omit' })
    if (!r.ok) return null
    const list = ((await r.json()) as { messages: GuestNote[] }).messages
    return list.map((m) => ({ name: m.name.slice(0, 40), text: m.text.replace(/[\n\r\t\u2028\u2029]/g, ' ').slice(0, 300), createdAt: m.createdAt }))
  } catch {
    return null
  }
}

export async function moderate(slug: string, server: string, id: string, action: 'approve' | 'delete'): Promise<void> {
  const r = await fetch(`${base(server)}/api/sites/${slug}/messages/${id}`, {
    method: 'POST',
    headers: { ...(await auth(slug)), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!r.ok) return fail(r)
}

export type SiteStatus = { open: boolean; ring: boolean; updatedAt: string }

/** null when this browser never published the slug or the server does not know it. */
export async function siteStatus(slug: string, server: string): Promise<SiteStatus | null> {
  if (!(await hasKey(slug))) return null
  const r = await fetch(`${base(server)}/api/sites/${slug}/status`, { headers: await auth(slug) })
  if (r.status === 403 || r.status === 404) return null
  if (!r.ok) return fail(r)
  return (await r.json()) as SiteStatus
}

export async function closeDoor(slug: string, server: string): Promise<void> {
  const r = await fetch(`${base(server)}/api/sites/${slug}/door`, {
    method: 'POST',
    headers: { ...(await auth(slug)), 'Content-Type': 'application/json' },
    body: JSON.stringify({ open: false }),
  })
  if (!r.ok) return fail(r)
}

export type RingLinks = { prev: string; next: string; random: string; hub: string }

export async function joinRing(slug: string, server: string): Promise<RingLinks> {
  const r = await fetch(`${base(server)}/api/sites/${slug}/ring`, { method: 'PUT', headers: await auth(slug) })
  if (!r.ok) return fail(r)
  return ((await r.json()) as { links: RingLinks }).links
}

export async function leaveRing(slug: string, server: string): Promise<void> {
  const r = await fetch(`${base(server)}/api/sites/${slug}/ring`, { method: 'DELETE', headers: await auth(slug) })
  if (!r.ok) return fail(r)
}

export type RingHome = { slug: string; title: string; tagline: string; demo: boolean; button: string | null }

export async function ringHomes(server: string): Promise<RingHome[]> {
  const r = await fetch(`${base(server)}/api/ring`, { credentials: 'omit' })
  if (!r.ok) return fail(r)
  return ((await r.json()) as { homes: RingHome[] }).homes
}

/** A neighbour's 88×31 badge, fetched from the same server. */
export async function fetchBadge(server: string, path: string): Promise<{ mime: 'image/png' | 'image/gif' | 'image/jpeg' | 'image/webp'; data: Uint8Array } | null> {
  const r = await fetch(`${base(server)}${path}`, { credentials: 'omit' })
  if (!r.ok) return null
  const type = (r.headers.get('content-type') ?? '').split(';')[0]!.trim()
  if (!['image/png', 'image/gif', 'image/jpeg', 'image/webp'].includes(type)) return null
  const data = new Uint8Array(await r.arrayBuffer())
  if (data.byteLength > 512 * 1024) return null
  return { mime: type as 'image/png', data }
}
