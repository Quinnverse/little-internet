import type { Letter } from '../core/letter.ts'
import { idbGet, idbSet } from './idb.ts'
import { base } from './publish.ts'

/**
 * Client for Heart Mail (friends and letters). The identity is the home's address (slug) and its owner key,
 * the same key that publishes the site; it stays in this browser (never in a backup or on a website).
 * Every call fails loudly with the server's reason: delivery is never reported as success unless the server said so.
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

export class PeopleError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(slug: string, server: string, method: string, path: string, body?: unknown): Promise<T> {
  const key = await keyFor(slug)
  let r: Response
  try {
    r = await fetch(`${base(server)}/api/people/${slug}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      credentials: 'omit',
    })
  } catch {
    throw new PeopleError(0, 'offline')
  }
  if (!r.ok) {
    let why = `${r.status}`
    try {
      const j = (await r.json()) as { error?: string }
      if (j.error) why = j.error
    } catch {
      /* not JSON */
    }
    throw new PeopleError(r.status, why)
  }
  return (await r.json()) as T
}

export type Person = { slug: string; title: string }
export type Friends = { friends: Person[]; incoming: Person[]; outgoing: Person[]; blocked: string[] }
export type MailItem = { id: string; from: string; fromTitle: string; createdAt: string; summary: string; unread: boolean }
export type SentItem = { id: string; to: string; toTitle: string; createdAt: string; summary: string; state: 'delivered' | 'read' }
export type FullMail = { id: string; from: string; to: string; createdAt: string; shareable: boolean; letter: Letter }

export const claim = (slug: string, server: string) => call<{ slug: string }>(slug, server, 'PUT', '')
export const friends = (slug: string, server: string) => call<Friends>(slug, server, 'GET', '/friends')
export const requestFriend = (slug: string, server: string, to: string) => call<{ status: string }>(slug, server, 'POST', '/friends', { to })
export const answerFriend = (slug: string, server: string, other: string, accept: boolean) => call<{ ok: true }>(slug, server, 'POST', `/friends/${other}/${accept ? 'accept' : 'decline'}`)
export const removeFriend = (slug: string, server: string, other: string) => call<{ ok: true }>(slug, server, 'DELETE', `/friends/${other}`)
export const blockPerson = (slug: string, server: string, other: string) => call<{ ok: true }>(slug, server, 'PUT', `/blocks/${other}`)
export const unblockPerson = (slug: string, server: string, other: string) => call<{ ok: true }>(slug, server, 'DELETE', `/blocks/${other}`)
export const inbox = (slug: string, server: string, since = '') => call<{ mail: MailItem[] }>(slug, server, 'GET', `/mail${since ? `?since=${encodeURIComponent(since)}` : ''}`)
export const sent = (slug: string, server: string) => call<{ sent: SentItem[] }>(slug, server, 'GET', '/mail/sent')
export const openMail = (slug: string, server: string, id: string) => call<FullMail>(slug, server, 'GET', `/mail/${id}`)
export const markRead = (slug: string, server: string, id: string) => call<{ ok: true }>(slug, server, 'POST', `/mail/${id}/read`)
export const deleteMail = (slug: string, server: string, id: string) => call<{ ok: true }>(slug, server, 'DELETE', `/mail/${id}`)

/**
 * Sends a letter. `clientId` makes the send idempotent: if the network drops after the server accepted it, the
 * retry with the same clientId returns the first delivery instead of sending a second letter.
 */
export const sendMail = (slug: string, server: string, to: string, clientId: string, letter: Letter, summary: string, shareable: boolean) =>
  call<{ id: string; deliveredAt: string; duplicate?: boolean }>(slug, server, 'POST', '/mail', { to, clientId, letter, summary, shareable })

/** Letters waiting to be (re)sent, kept on this device only until the server confirms delivery. */
const OUTBOX = 'mail-outbox'
export type Pending = { clientId: string; to: string; letter: Letter; summary: string; shareable: boolean; createdAt: string; error?: string }
export const loadOutbox = async (): Promise<Pending[]> => (await idbGet<Pending[]>(OUTBOX)) ?? []
export const saveOutbox = (list: Pending[]) => idbSet(OUTBOX, list)

/** New 22-character client id. */
export function newClientId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 22)
}
