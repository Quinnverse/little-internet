import { exportSite } from '../core/exportZip.ts'
import type { Project } from '../core/schema.ts'
import { idbGet, idbSet } from './idb.ts'

/**
 * Client for the small publishing server. Only the public-projection site ZIP is ever sent.
 * The owner's key for a slug is created here, stays in this browser (outside the project and
 * outside every backup), and the server stores only its hash.
 */

const KEYS = 'publish-keys'

async function keyFor(slug: string): Promise<string> {
  const all = (await idbGet<Record<string, string>>(KEYS)) ?? {}
  if (all[slug]) return all[slug]!
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const key = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  await idbSet(KEYS, { ...all, [slug]: key })
  return key
}

export const hasKey = async (slug: string) => !!((await idbGet<Record<string, string>>(KEYS)) ?? {})[slug]

function base(server: string): string {
  const s = server.trim().replace(/\/+$/, '')
  return s || location.origin
}

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

export async function publishSite(p: Project, server: string): Promise<string> {
  const key = await keyFor(p.site.slug)
  const zip = exportSite(p)
  const r = await fetch(`${base(server)}/api/sites/${p.site.slug}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/zip' },
    body: zip as BodyInit,
  })
  if (!r.ok) return fail(r)
  const j = (await r.json()) as { path: string }
  return new URL(j.path, base(server)).href
}

export type GuestMessage = { id: string; name: string; text: string; createdAt: string; approved: boolean }

export async function listMessages(slug: string, server: string): Promise<GuestMessage[]> {
  const key = await keyFor(slug)
  const r = await fetch(`${base(server)}/api/sites/${slug}/messages`, { headers: { Authorization: `Bearer ${key}` } })
  if (!r.ok) return fail(r)
  return ((await r.json()) as { messages: GuestMessage[] }).messages
}

export async function moderate(slug: string, server: string, id: string, action: 'approve' | 'delete'): Promise<void> {
  const key = await keyFor(slug)
  const r = await fetch(`${base(server)}/api/sites/${slug}/messages/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!r.ok) return fail(r)
}
