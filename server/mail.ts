// Heart Mail: friends and letters between independent homes. Everything here is authenticated with the
// sender's/recipient's owner key (the same SHA-256-hashed key that protects publishing). No message is ever
// readable by anyone except the two people involved.
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { LetterSchema, letterIsEmpty } from '../src/core/letter.ts'

export type MailDeps = {
  db: DatabaseSync
  json: (res: ServerResponse, status: number, body: unknown, extra?: Record<string, string>) => void
  readBody: (req: IncomingMessage, limit: number) => Promise<Buffer>
  HttpError: new (status: number, message: string) => Error
  allow: (key: string, max: number, windowMs: number) => boolean
  /** Throws 403 unless the request carries the owner key of `slug`. */
  owner: (req: IncomingMessage, slug: string) => void
  /** Whether `slug` is a claimed identity. */
  exists: (slug: string) => boolean
  /** Claims `slug` with this key if free; true when the caller now owns it (new or already theirs). */
  claimIdentity: (slug: string, keyHex: string) => boolean
  /** Public title of a slug (for display), '' if unknown. */
  titleOf: (slug: string) => string
  ip: (req: IncomingMessage) => string
  now?: () => Date
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/
const MSG_ID = /^[0-9a-f-]{36}$/
export const MAX_MAIL_BYTES = 760_000
export const MAX_INBOX = 500

export function mailSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY (a, b)
    );
    CREATE TABLE IF NOT EXISTS blocks (blocker TEXT NOT NULL, blocked TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (blocker, blocked));
    CREATE TABLE IF NOT EXISTS mail (
      id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, client_id TEXT NOT NULL,
      created_at TEXT NOT NULL, payload TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
      shareable INTEGER NOT NULL DEFAULT 0,
      read_at TEXT, recipient_deleted INTEGER NOT NULL DEFAULT 0, sender_deleted INTEGER NOT NULL DEFAULT 0,
      UNIQUE (sender, client_id)
    );
    CREATE INDEX IF NOT EXISTS mail_rcpt ON mail(recipient, created_at);
    CREATE INDEX IF NOT EXISTS mail_sender ON mail(sender, created_at);
  `)
}

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x])

/** Handles /api/people/... Returns false when the path is not for this module. */
export async function handleMail(d: MailDeps, req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> {
  if (parts[1] !== 'people') return false
  const E = d.HttpError
  const me = parts[2]
  if (!me || !SLUG.test(me)) throw new E(404, 'Not found')
  const now = () => (d.now ? d.now() : new Date()).toISOString()
  const q = {
    friendship: d.db.prepare('SELECT status, requested_by FROM friendships WHERE a = ? AND b = ?'),
    insertFriend: d.db.prepare('INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?)'),
    setFriend: d.db.prepare('UPDATE friendships SET status = ? WHERE a = ? AND b = ?'),
    delFriend: d.db.prepare('DELETE FROM friendships WHERE a = ? AND b = ?'),
    listFriends: d.db.prepare('SELECT a, b, status, requested_by FROM friendships WHERE a = ? OR b = ?'),
    blocked: d.db.prepare('SELECT 1 AS x FROM blocks WHERE blocker = ? AND blocked = ?'),
    block: d.db.prepare('INSERT OR IGNORE INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)'),
    unblock: d.db.prepare('DELETE FROM blocks WHERE blocker = ? AND blocked = ?'),
    listBlocked: d.db.prepare('SELECT blocked FROM blocks WHERE blocker = ? ORDER BY blocked'),
    byClient: d.db.prepare('SELECT id, created_at FROM mail WHERE sender = ? AND client_id = ?'),
    insertMail: d.db.prepare('INSERT INTO mail (id, sender, recipient, client_id, created_at, payload, summary, shareable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    inbox: d.db.prepare('SELECT id, sender, created_at, summary, read_at FROM mail WHERE recipient = ? AND recipient_deleted = 0 AND created_at > ? ORDER BY created_at, id LIMIT 200'),
    inboxCount: d.db.prepare('SELECT COUNT(*) AS n FROM mail WHERE recipient = ? AND recipient_deleted = 0'),
    outbox: d.db.prepare('SELECT id, recipient, created_at, summary, read_at, recipient_deleted FROM mail WHERE sender = ? AND sender_deleted = 0 ORDER BY created_at DESC LIMIT 100'),
    one: d.db.prepare('SELECT * FROM mail WHERE id = ?'),
    markRead: d.db.prepare('UPDATE mail SET read_at = ? WHERE id = ? AND recipient = ? AND read_at IS NULL'),
    delRecipient: d.db.prepare('UPDATE mail SET recipient_deleted = 1 WHERE id = ? AND recipient = ?'),
    delSender: d.db.prepare('UPDATE mail SET sender_deleted = 1 WHERE id = ? AND sender = ?'),
    pairCount: d.db.prepare('SELECT COUNT(*) AS n FROM mail WHERE sender = ? AND recipient = ? AND created_at > ?'),
  }
  const friendRow = (x: string, y: string) => {
    const [a, b] = pair(x, y)
    return q.friendship.get(a, b) as { status: string; requested_by: string } | undefined
  }
  const isBlocked = (blocker: string, blocked: string) => !!q.blocked.get(blocker, blocked)
  const readJson = async (limit: number): Promise<Record<string, unknown>> => {
    try {
      const v = JSON.parse((await d.readBody(req, limit)).toString('utf8'))
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('shape')
      return v as Record<string, unknown>
    } catch (e) {
      if (e instanceof E) throw e
      throw new E(400, 'Invalid JSON')
    }
  }
  const other = (i: number) => {
    const s = parts[i]
    if (!s || !SLUG.test(s)) throw new E(404, 'Not found')
    return s
  }

  // PUT /api/people/:me  claim an identity (no website needed)
  if (parts.length === 3 && req.method === 'PUT') return void (await claim(d, req, res, me)), true
  d.owner(req, me) // everything below needs the owner key of `me`

  const sub = parts[3]

  // ---- friends
  if (sub === 'friends') {
    if (parts.length === 4 && req.method === 'GET') {
      const rows = q.listFriends.all(me, me) as { a: string; b: string; status: string; requested_by: string }[]
      const out = { friends: [] as { slug: string; title: string }[], incoming: [] as { slug: string; title: string }[], outgoing: [] as { slug: string; title: string }[], blocked: (q.listBlocked.all(me) as { blocked: string }[]).map((r) => r.blocked) }
      for (const r of rows) {
        const o = r.a === me ? r.b : r.a
        const entry = { slug: o, title: d.titleOf(o) }
        if (r.status === 'accepted') out.friends.push(entry)
        else if (r.requested_by === me) out.outgoing.push(entry)
        else out.incoming.push(entry)
      }
      return d.json(res, 200, out, { 'Cache-Control': 'no-store' }), true
    }
    if (parts.length === 4 && req.method === 'POST') {
      // request: {to}
      const b = await readJson(256)
      const to = typeof b.to === 'string' ? b.to : ''
      if (!SLUG.test(to) || to === me) throw new E(400, 'Choose another home')
      if (!d.allow(`fr:${me}`, 20, 3600_000)) throw new E(429, 'Too many requests')
      // The same answer for "no such home" and "blocked you": do not reveal who blocked whom.
      if (!d.exists(to) || isBlocked(to, me)) return d.json(res, 202, { status: 'pending' }), true
      if (isBlocked(me, to)) throw new E(409, 'You blocked this home. Unblock it first.')
      const cur = friendRow(me, to)
      const [a, bb] = pair(me, to)
      if (!cur) q.insertFriend.run(a, bb, 'pending', me, now())
      else if (cur.status === 'pending' && cur.requested_by !== me) q.setFriend.run('accepted', a, bb) // they asked first: this is a yes
      return d.json(res, 202, { status: friendRow(me, to)?.status ?? 'pending' }), true
    }
    if (parts.length === 6 && req.method === 'POST' && (parts[5] === 'accept' || parts[5] === 'decline')) {
      const o = other(4)
      const cur = friendRow(me, o)
      if (!cur || cur.status !== 'pending' || cur.requested_by === me) throw new E(404, 'No such request')
      const [a, bb] = pair(me, o)
      if (parts[5] === 'accept') q.setFriend.run('accepted', a, bb)
      else q.delFriend.run(a, bb)
      return d.json(res, 200, { ok: true }), true
    }
    if (parts.length === 5 && req.method === 'DELETE') {
      const [a, bb] = pair(me, other(4))
      q.delFriend.run(a, bb)
      return d.json(res, 200, { ok: true }), true
    }
  }

  // ---- blocks
  if (sub === 'blocks' && parts.length === 5) {
    const o = other(4)
    if (req.method === 'PUT') {
      q.block.run(me, o, now())
      const [a, bb] = pair(me, o)
      q.delFriend.run(a, bb)
      return d.json(res, 200, { ok: true }), true
    }
    if (req.method === 'DELETE') return q.unblock.run(me, o), d.json(res, 200, { ok: true }), true
  }

  // ---- mail
  if (sub === 'mail') {
    // POST /mail  {to, clientId, letter, kind?}
    if (parts.length === 4 && req.method === 'POST') {
      if (!d.allow(`mail:${me}`, 40, 3600_000) || !d.allow(`mailip:${d.ip(req)}`, 120, 3600_000)) throw new E(429, 'You are sending too fast. Try again later.')
      const b = await readJson(MAX_MAIL_BYTES + 2048)
      const to = typeof b.to === 'string' ? b.to : ''
      const clientId = typeof b.clientId === 'string' ? b.clientId : ''
      if (!SLUG.test(to) || to === me) throw new E(400, 'Choose a friend to send to')
      if (!CLIENT_ID.test(clientId)) throw new E(400, 'Missing clientId')
      const parsed = LetterSchema.safeParse(b.letter)
      if (!parsed.success) throw new E(400, 'That letter is not valid')
      if (letterIsEmpty(parsed.data)) throw new E(400, 'The letter is empty')
      const payload = JSON.stringify(parsed.data)
      if (payload.length > MAX_MAIL_BYTES) throw new E(413, 'The letter is too large')
      // Idempotent: a retry with the same clientId returns the first delivery instead of sending twice.
      const dup = q.byClient.get(me, clientId) as { id: string; created_at: string } | undefined
      if (dup) return d.json(res, 200, { id: dup.id, deliveredAt: dup.created_at, duplicate: true }), true
      const f = friendRow(me, to)
      if (!f || f.status !== 'accepted') throw new E(403, 'You can only send to friends who accepted')
      if (isBlocked(to, me)) throw new E(403, 'This home is not taking letters from you')
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      if ((q.pairCount.get(me, to, since) as { n: number }).n >= 30) throw new E(429, 'You have sent a lot to this friend today. Try tomorrow.')
      if ((q.inboxCount.get(to) as { n: number }).n >= MAX_INBOX) throw new E(409, 'Their mailbox is full')
      const id = randomUUID()
      const at = now()
      const summary = typeof b.summary === 'string' ? b.summary.replace(/[\u0000-\u001f]/g, ' ').slice(0, 80) : ''
      q.insertMail.run(id, me, to, clientId, at, payload, summary, b.shareable === true ? 1 : 0)
      return d.json(res, 201, { id, deliveredAt: at }), true
    }
    // GET /mail?since=ISO   inbox (metadata only)
    if (parts.length === 4 && req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://x')
      const since = url.searchParams.get('since') ?? ''
      const rows = q.inbox.all(me, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(since) ? since : '') as { id: string; sender: string; created_at: string; summary: string; read_at: string | null }[]
      return d.json(res, 200, { mail: rows.map((r) => ({ id: r.id, from: r.sender, fromTitle: d.titleOf(r.sender), createdAt: r.created_at, summary: r.summary, unread: r.read_at === null })) }, { 'Cache-Control': 'no-store' }), true
    }
    if (parts.length === 5 && parts[4] === 'sent' && req.method === 'GET') {
      const rows = q.outbox.all(me) as { id: string; recipient: string; created_at: string; summary: string; read_at: string | null; recipient_deleted: number }[]
      return d.json(res, 200, { sent: rows.map((r) => ({ id: r.id, to: r.recipient, toTitle: d.titleOf(r.recipient), createdAt: r.created_at, summary: r.summary, state: r.read_at ? 'read' : 'delivered' })) }, { 'Cache-Control': 'no-store' }), true
    }
    // GET /mail/:id   the letter itself (recipient, or the sender's own copy)
    if (parts.length === 5 && MSG_ID.test(parts[4]!) && req.method === 'GET') {
      const m = q.one.get(parts[4]!) as { id: string; sender: string; recipient: string; created_at: string; payload: string; shareable: number; recipient_deleted: number; sender_deleted: number } | undefined
      const mine = m && ((m.recipient === me && !m.recipient_deleted) || (m.sender === me && !m.sender_deleted))
      if (!m || !mine) throw new E(404, 'Not found')
      return d.json(res, 200, { id: m.id, from: m.sender, to: m.recipient, createdAt: m.created_at, shareable: m.shareable === 1, letter: JSON.parse(m.payload) }, { 'Cache-Control': 'no-store' }), true
    }
    if (parts.length === 6 && MSG_ID.test(parts[4]!) && parts[5] === 'read' && req.method === 'POST') {
      q.markRead.run(now(), parts[4]!, me)
      return d.json(res, 200, { ok: true }), true
    }
    if (parts.length === 5 && MSG_ID.test(parts[4]!) && req.method === 'DELETE') {
      q.delRecipient.run(parts[4]!, me)
      q.delSender.run(parts[4]!, me)
      return d.json(res, 200, { ok: true }), true
    }
  }
  throw new E(404, 'Not found')
}

async function claim(d: MailDeps, req: IncomingMessage, res: ServerResponse, me: string): Promise<void> {
  // Claiming is the same act as the first publish: the first key wins. Re-claiming needs that key.
  const m = /^Bearer ([0-9a-f]{64})$/.exec(String(req.headers.authorization ?? ''))
  if (!m) throw new d.HttpError(401, 'Missing or malformed key')
  if (d.exists(me)) {
    try {
      d.owner(req, me)
      d.json(res, 200, { slug: me })
      return
    } catch {
      // Failed ownership checks still consume the same anti-abuse budget as new claims.
    }
  }
  if (!d.allow(`claim:${d.ip(req)}`, 20, 3600_000)) throw new d.HttpError(429, 'Too many requests')
  if (!d.claimIdentity(me, m[1]!)) throw new d.HttpError(403, 'That name is taken')
  d.json(res, 200, { slug: me })
}
