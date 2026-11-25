// Little Internet server: hosts published sites at /@slug/ and keeps guestbook messages.
//
//   node server/index.ts            (Node 22.18+ runs TypeScript directly)
//
// Trust model: every request is hostile. Only a public-projection site ZIP is accepted, and only
// from the holder of the slug's key (stored as a SHA-256 hash). Guestbook text is plain text,
// length-capped, rate limited, and pending until the owner approves it.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { unzipSync } from 'fflate'
import { StoredProjectSchema } from '../src/core/schema.ts'

export type AppOptions = {
  dataDir: string
  /** Built editor app to serve at "/" (optional). */
  appDir?: string
  maxZipBytes?: number
  trustProxy?: boolean
  /** Public origin used in webring links, e.g. https://little.example (defaults to the request host). */
  publicBase?: string
}

/** What the server learned from a validated site.json. */
export type SiteMeta = { title: string; tagline: string; demo: boolean; guestbook: boolean; button: string | null }

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const KEY = /^[0-9a-f]{64}$/
const MSG_ID = /^[0-9a-f-]{36}$/

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
  '.glb': 'model/gltf-binary',
}

/** Files a published site may contain. Anything else is refused, never stored. */
const SITE_EXT = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.xml',
  '.jpg',
  '.png',
  '.webp',
  '.gif',
  '.webm',
  '.m4a',
  '.ogg',
  '.mp3',
])
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  '.png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  '.webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
}
const MAX_ENTRIES = 2000
const MAX_FILE = 15 * 1024 * 1024
const MAX_TOTAL = 200 * 1024 * 1024

const sha = (s: string) => createHash('sha256').update(s).digest()

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra,
  })
  res.end(data)
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) throw new HttpError(413, 'Too large')
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > limit) throw new HttpError(413, 'Too large')
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks)
}

/** Checks a ZIP's entry names and sizes, and returns its files. Throws HttpError(400/413). */
export function readSiteZip(zip: Uint8Array, slug: string): { files: Map<string, Uint8Array>; meta: SiteMeta } {
  let total = 0
  let count = 0
  let tooBig = false
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(zip, {
      filter: (f) => {
        count++
        total += f.originalSize
        if (f.originalSize > MAX_FILE || total > MAX_TOTAL || count > MAX_ENTRIES) {
          tooBig = true
          return false
        }
        return !f.name.endsWith('/')
      },
    })
  } catch {
    throw new HttpError(400, 'That is not a valid ZIP file')
  }
  if (tooBig) throw new HttpError(413, 'The site is too large')
  const out = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(files)) {
    if (
      name.length > 200 ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').some((p) => p === '' || p === '.' || p === '..' || p.startsWith('.')) ||
      !/^[A-Za-z0-9._\-/]+$/.test(name) ||
      !SITE_EXT.has(extname(name).toLowerCase())
    ) {
      throw new HttpError(400, `File not allowed: ${name.slice(0, 60)}`)
    }
    const magic = MAGIC[extname(name).toLowerCase()]
    if (magic && !magic(data)) throw new HttpError(400, `Not a real image: ${name.slice(0, 60)}`)
    out.set(name, data)
  }
  if (!out.has('index.html') || !out.has('site.json')) throw new HttpError(400, 'Not a Little Internet site export')
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(out.get('site.json')))
  } catch {
    throw new HttpError(400, 'site.json is not valid')
  }
  // The public snapshot must be a valid project AND public-only: a published site may not carry
  // a private entry or recording, whatever the client sends.
  const parsed = StoredProjectSchema.safeParse(raw)
  if (!parsed.success) throw new HttpError(400, 'site.json is not a valid Little Internet site')
  const p = parsed.data
  if (p.site.slug !== slug) throw new HttpError(400, 'The site address does not match')
  if (p.posts.some((x) => x.visibility !== 'public') || p.recordings.some((r) => r.visibility !== 'public'))
    throw new HttpError(400, 'A published site may only contain public entries')
  for (const a of p.assets) if (!out.has(a.path)) throw new HttpError(400, `Missing file ${a.path.slice(0, 60)}`)
  const design = p.web.published?.design ?? p.web.draft
  const button = [...out.keys()].find((n) => /^button\.(png|gif|jpg|webp)$/.test(n)) ?? null
  const meta: SiteMeta = {
    title: p.site.title,
    tagline: p.site.tagline,
    demo: p.site.demo === true,
    guestbook: design.widgets.some((w) => w.content.type === 'guestbook' && w.content.open),
    button,
  }
  return { files: out, meta }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Response headers for user-published pages: no script can reach the editor's origin or storage. */
const SITE_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation; " +
    "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; " +
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Sandboxed pages have an opaque origin; the 3D room loads public images as textures (CORS).
  'Access-Control-Allow-Origin': '*',
}

function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max)
}

export function createApp(opts: AppOptions): {
  server: Server
  close: () => Promise<void>
} {
  const sitesDir = resolve(opts.dataDir, 'sites')
  mkdirSync(sitesDir, { recursive: true })
  const db = new DatabaseSync(join(opts.dataDir, 'li.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (slug TEXT PRIMARY KEY, key_hash BLOB NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL,
      created_at TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS messages_slug ON messages(slug, created_at);
  `)
  // Columns added with Web Atelier (door, webring, directory). Older databases gain them here.
  const cols = new Set((db.prepare('PRAGMA table_info(sites)').all() as { name: string }[]).map((c) => c.name))
  const addCol = (name: string, def: string) => {
    if (!cols.has(name)) db.exec(`ALTER TABLE sites ADD COLUMN ${name} ${def}`)
  }
  addCol('open', 'INTEGER NOT NULL DEFAULT 1')
  addCol('ring_at', 'TEXT')
  addCol('title', "TEXT NOT NULL DEFAULT ''")
  addCol('tagline', "TEXT NOT NULL DEFAULT ''")
  addCol('demo', 'INTEGER NOT NULL DEFAULT 0')
  addCol('guestbook', 'INTEGER NOT NULL DEFAULT 1')
  addCol('button', 'TEXT')
  type SiteRow = { key_hash: Uint8Array; open: number; ring_at: string | null; title: string; tagline: string; demo: number; guestbook: number; button: string | null; updated_at: string }
  const getSite = db.prepare('SELECT key_hash, open, ring_at, title, tagline, demo, guestbook, button, updated_at FROM sites WHERE slug = ?')
  const claim = db.prepare(
    'INSERT INTO sites (slug, key_hash, updated_at, open, title, tagline, demo, guestbook, button) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)',
  )
  const touch = db.prepare(
    'UPDATE sites SET updated_at = ?, open = 1, title = ?, tagline = ?, demo = ?, guestbook = ?, button = ? WHERE slug = ?',
  )
  const setOpen = db.prepare('UPDATE sites SET open = ? WHERE slug = ?')
  const setRing = db.prepare('UPDATE sites SET ring_at = ? WHERE slug = ?')
  const ringRows = db.prepare(
    'SELECT slug, title, tagline, demo, button FROM sites WHERE ring_at IS NOT NULL AND open = 1 ORDER BY ring_at, slug',
  )
  const site = (slug: string) => getSite.get(slug) as SiteRow | undefined
  /** Visitors may reach a site only when it exists and its door is open. */
  const visitable = (slug: string) => {
    const row = site(slug)
    return row && row.open === 1 ? row : undefined
  }
  const insertMsg = db.prepare(
    'INSERT INTO messages (id, slug, name, text, created_at, approved) VALUES (?, ?, ?, ?, ?, 0)',
  )
  const allMsgs = db.prepare(
    'SELECT id, name, text, created_at AS createdAt, approved FROM messages WHERE slug = ? ORDER BY created_at DESC LIMIT 300',
  )
  const okMsgs = db.prepare(
    'SELECT name, text, created_at AS createdAt FROM messages WHERE slug = ? AND approved = 1 ORDER BY created_at DESC LIMIT 100',
  )
  const countPending = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE slug = ? AND approved = 0')
  const approve = db.prepare('UPDATE messages SET approved = 1 WHERE id = ? AND slug = ?')
  const remove = db.prepare('DELETE FROM messages WHERE id = ? AND slug = ?')

  const maxZip = opts.maxZipBytes ?? 50 * 1024 * 1024
  const hits = new Map<string, number[]>()

  /** Sliding-window limiter. Returns false when the caller is over the limit. */
  const allow = (key: string, max: number, windowMs: number): boolean => {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (list.length >= max) {
      hits.set(key, list)
      return false
    }
    list.push(now)
    hits.set(key, list)
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
    return true
  }

  const ipOf = (req: IncomingMessage): string => {
    if (opts.trustProxy) {
      const xf = req.headers['x-forwarded-for']
      const first = (Array.isArray(xf) ? xf[0] : xf)?.split(',')[0]?.trim()
      if (first) return first
    }
    return req.socket.remoteAddress ?? 'unknown'
  }

  const owner = (req: IncomingMessage, slug: string): void => {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(String(req.headers.authorization ?? ''))
    const row = site(slug)
    if (!m || !row) throw new HttpError(403, 'Not allowed')
    const a = sha(m[1]!)
    const b = Buffer.from(row.key_hash)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, 'Not allowed')
  }

  const cors = (res: ServerResponse) => {
    // Bearer tokens, not cookies: no ambient authority, so any origin may call the API.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '600')
  }

  function serveFile(req: IncomingMessage, res: ServerResponse, root: string, rel: string, fallbackIndex = true) {
    const abs = resolve(root, `.${sep}${normalize(rel)}`)
    if (abs !== root && !abs.startsWith(root + sep)) throw new HttpError(404, 'Not found')
    let file = abs
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html')
    } catch {
      if (!fallbackIndex) throw new HttpError(404, 'Not found')
      throw new HttpError(404, 'Not found')
    }
    let st
    try {
      st = statSync(file)
    } catch {
      throw new HttpError(404, 'Not found')
    }
    if (!st.isFile()) throw new HttpError(404, 'Not found')
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
    const headers: Record<string, string | number> = {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes',
    }
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` })
        return void res.end()
      }
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1,
      })
      if (req.method === 'HEAD') return void res.end()
      return void createReadStream(file, { start, end }).pipe(res)
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size })
    if (req.method === 'HEAD') return void res.end()
    createReadStream(file).pipe(res)
  }

  type RingHome = { slug: string; title: string; tagline: string; demo: boolean; button: string | null }

  function ringList(): RingHome[] {
    return (ringRows.all() as { slug: string; title: string; tagline: string; demo: number; button: string | null }[])
      .filter((r) => existsSync(join(sitesDir, r.slug, 'index.html')))
      .map((r) => ({ slug: r.slug, title: r.title, tagline: r.tagline, demo: r.demo === 1, button: r.button ? `/@${r.slug}/${r.button}` : null }))
  }

  function publicOrigin(req: IncomingMessage): string {
    if (opts.publicBase) return opts.publicBase.replace(/\/+$/, '')
    const proto = opts.trustProxy && req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
    const host = String(req.headers.host ?? 'localhost').replace(/[^a-zA-Z0-9.:[\]-]/g, '')
    return `${proto}://${host}`
  }

  const PAGE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

  function html(res: ServerResponse, status: number, title: string, body: string) {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': PAGE_CSP,
      'Cache-Control': 'no-cache',
      'Referrer-Policy': 'no-referrer',
    })
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;font:16px/1.5 Georgia,serif;background:#0b0b3b;color:#f2f2f2}main{max-width:760px;margin:0 auto;padding:24px 16px}a{color:#7dff6b}h1{font:700 32px/1.1 "Comic Sans MS","Chalkboard SE",cursive;color:#fff27a}ul{list-style:none;padding:0}li{display:flex;gap:12px;align-items:center;padding:12px;margin:10px 0;background:#c0c0c0;color:#111;border:3px outset #f4f4f4}li a{color:#0000ee;font-weight:700}img{width:88px;height:31px;image-rendering:pixelated;flex:none}.b{display:inline-flex;align-items:center;justify-content:center;width:88px;height:31px;flex:none;background:linear-gradient(#3b3bb0,#121260);color:#fff;font:700 9px Verdana,sans-serif;text-transform:uppercase;text-align:center;border:2px outset #bbb}.demo{font:600 11px system-ui,sans-serif;background:#fff6c2;border:1px solid #c9a93a;border-radius:9px;padding:1px 6px;margin-left:6px}.t{display:block;font-size:.9em;color:#333}.nav{display:flex;gap:10px;flex-wrap:wrap}.nav a{background:#efefef;color:#111;border:2px outset #ddd;padding:8px 14px;text-decoration:none;font-weight:700}</style></head><body><main>${body}</main></body></html>`)
  }

  function ringPage(res: ServerResponse) {
    const homes = ringList()
    const items = homes
      .map(
        (h) =>
          `<li>${h.button ? `<img src="${esc(h.button)}" alt="">` : `<span class="b">${esc(h.title.slice(0, 18))}</span>`}<span><a href="/@${h.slug}/">${esc(h.title || h.slug)}</a>${h.demo ? '<span class="demo">demo</span>' : ''}<span class="t">${esc(h.tagline)}</span></span></li>`,
      )
      .join('')
    const first = homes[0]
    html(
      res,
      200,
      'Little Internet webring',
      `<h1>The Little Internet webring</h1><p>Homes that chose to join. No ranking, no recommendations. Walk from one to the next, or jump at random.</p>` +
        (first ? `<p class="nav"><a href="/@${first.slug}/">Start walking</a><a href="/ring/${first.slug}/random">Random home</a></p>` : '') +
        (items ? `<ul>${items}</ul>` : '<p>Nobody has joined yet.</p>'),
    )
  }

  function closedPage(res: ServerResponse) {
    html(res, 404, 'The door is closed', '<h1>The door is closed</h1><p>The owner of this home has closed the door for now. Nothing here is public at the moment.</p><p><a href="/ring/">Walk the webring</a></p>')
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = decodeURIComponent(url.pathname)
    res.setHeader('X-Content-Type-Options', 'nosniff')

    if (path.startsWith('/api/')) {
      cors(res)
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        return void res.end()
      }
      const parts = path.split('/').filter(Boolean) // api, sites, slug, ...
      // GET /api/ring — the public webring directory (only open homes that joined)
      if (parts[1] === 'ring' && parts.length === 2 && req.method === 'GET') {
        return json(res, 200, { homes: ringList() }, { 'Cache-Control': 'no-cache' })
      }
      if (parts[1] !== 'sites' || !parts[2] || !SLUG.test(parts[2])) throw new HttpError(404, 'Not found')
      const slug = parts[2]
      const ip = ipOf(req)

      // PUT /api/sites/:slug  — publish
      if (parts.length === 3 && req.method === 'PUT') {
        if (!allow(`pub:${ip}`, 30, 3600_000)) throw new HttpError(429, 'Too many requests')
        const m = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))
        if (!m || !KEY.test(m[1]!)) throw new HttpError(401, 'Missing or malformed key')
        const row = site(slug)
        if (row) owner(req, slug)
        const body = await readBody(req, maxZip)
        const { files, meta } = readSiteZip(new Uint8Array(body), slug)
        const tmp = join(opts.dataDir, `tmp-${randomUUID()}`)
        try {
          for (const [name, data] of files) {
            const dest = resolve(tmp, name)
            if (!dest.startsWith(resolve(tmp) + sep)) throw new HttpError(400, 'Bad path')
            mkdirSync(dirname(dest), { recursive: true })
            writeFileSync(dest, data)
          }
          const final = join(sitesDir, slug)
          const old = `${final}.old-${randomUUID()}`
          if (existsSync(final)) renameSync(final, old)
          renameSync(tmp, final)
          rmSync(old, { recursive: true, force: true })
        } catch (e) {
          rmSync(tmp, { recursive: true, force: true })
          throw e
        }
        const now = new Date().toISOString()
        const metaArgs = [meta.title, meta.tagline, meta.demo ? 1 : 0, meta.guestbook ? 1 : 0, meta.button] as const
        if (row) touch.run(now, ...metaArgs, slug)
        else claim.run(slug, sha(m[1]!), now, ...metaArgs)
        return json(res, 200, { path: `/@${slug}/`, files: files.size })
      }

      // GET /api/sites/:slug/status — owner: door, webring, last publish
      if (parts[3] === 'status' && parts.length === 4 && req.method === 'GET') {
        owner(req, slug)
        const row = site(slug)!
        return json(res, 200, { open: row.open === 1, ring: row.ring_at !== null, updatedAt: row.updated_at })
      }

      // POST /api/sites/:slug/door {open:false} — owner closes the door: the snapshot is deleted
      // from disk, so nothing (pages, media, RSS, guestbook, webring entry) is served any more.
      // Opening again is a fresh publish, which the editor does after a visitor preview.
      if (parts[3] === 'door' && parts.length === 4 && req.method === 'POST') {
        owner(req, slug)
        let b: { open?: unknown }
        try {
          b = JSON.parse((await readBody(req, 256)).toString('utf8'))
        } catch {
          throw new HttpError(400, 'Invalid JSON')
        }
        if (b.open !== false) throw new HttpError(409, 'Publish your website to open the door again')
        rmSync(join(sitesDir, slug), { recursive: true, force: true })
        setOpen.run(0, slug)
        return json(res, 200, { open: false })
      }

      // PUT / DELETE /api/sites/:slug/ring — owner joins or leaves the webring
      if (parts[3] === 'ring' && parts.length === 4 && (req.method === 'PUT' || req.method === 'DELETE')) {
        owner(req, slug)
        const row = site(slug)!
        if (req.method === 'DELETE') {
          setRing.run(null, slug)
          return json(res, 200, { ring: false })
        }
        if (row.open !== 1) throw new HttpError(409, 'Open your door before joining the webring')
        if (!row.ring_at) setRing.run(new Date().toISOString(), slug)
        const origin = publicOrigin(req)
        return json(res, 200, {
          ring: true,
          links: {
            prev: `${origin}/ring/${slug}/prev`,
            next: `${origin}/ring/${slug}/next`,
            random: `${origin}/ring/${slug}/random`,
            hub: `${origin}/ring/`,
          },
        })
      }

      // GET /api/sites/:slug/messages/approved — public
      if (parts[3] === 'messages' && parts[4] === 'approved' && req.method === 'GET') {
        const row = visitable(slug)
        if (!row || !row.guestbook) throw new HttpError(404, 'Not found')
        return json(res, 200, { messages: okMsgs.all(slug) }, { 'Cache-Control': 'public, max-age=30' })
      }

      // POST /api/sites/:slug/messages — public, pending until approved
      if (parts[3] === 'messages' && parts.length === 4 && req.method === 'POST') {
        const row = visitable(slug)
        if (!row) throw new HttpError(404, 'Not found')
        if (!row.guestbook) throw new HttpError(403, 'The guestbook is closed')
        if (!/^application\/json\b/.test(String(req.headers['content-type'] ?? '')))
          throw new HttpError(415, 'Send JSON')
        if (!allow(`msg:${slug}:${ip}`, 3, 3600_000) || !allow(`msg:${ip}`, 20, 3600_000))
          throw new HttpError(429, 'Too many messages. Try again later.')
        let b: Record<string, unknown>
        try {
          b = JSON.parse((await readBody(req, 4096)).toString('utf8'))
        } catch (e) {
          if (e instanceof HttpError) throw e
          throw new HttpError(400, 'Invalid JSON')
        }
        if (typeof b.website === 'string' && b.website !== '') return json(res, 201, { ok: true }) // bots fill the hidden field
        const name = clean(b.name, 40) || 'Anonymous'
        const text = clean(b.text, 300)
        if (!text) throw new HttpError(400, 'Write something first')
        if ((countPending.get(slug) as { n: number }).n >= 200)
          throw new HttpError(429, 'The guestbook is full for now')
        insertMsg.run(randomUUID(), slug, name, text, new Date().toISOString())
        return json(res, 201, { ok: true })
      }

      // Owner-only
      if (parts[3] === 'messages') {
        owner(req, slug)
        if (parts.length === 4 && req.method === 'GET')
          return json(res, 200, {
            messages: (allMsgs.all(slug) as { approved: number }[]).map((m) => ({ ...m, approved: !!m.approved })),
          })
        if (parts.length === 5 && req.method === 'POST' && MSG_ID.test(parts[4]!)) {
          let b: { action?: string }
          try {
            b = JSON.parse((await readBody(req, 1024)).toString('utf8'))
          } catch {
            throw new HttpError(400, 'Invalid JSON')
          }
          if (b.action === 'approve') approve.run(parts[4]!, slug)
          else if (b.action === 'delete') remove.run(parts[4]!, slug)
          else throw new HttpError(400, 'Unknown action')
          return json(res, 200, { ok: true })
        }
      }
      throw new HttpError(404, 'Not found')
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed')

    // Webring: /ring/ (directory) and /ring/:slug/prev|next|random (redirects, like the old CGI rings)
    if (path === '/ring' || path === '/ring/') {
      if (path === '/ring') {
        res.writeHead(301, { Location: '/ring/' })
        return void res.end()
      }
      return ringPage(res)
    }
    const hop = /^\/ring\/([a-z0-9-]+)\/(prev|next|random)$/.exec(path)
    if (hop) {
      const homes = ringList()
      const from = homes.findIndex((h) => h.slug === hop[1])
      let target: string | undefined
      if (homes.length) {
        if (hop[2] === 'random') {
          const others = homes.filter((h) => h.slug !== hop[1])
          target = (others.length ? others : homes)[Math.floor(Math.random() * (others.length || homes.length))]!.slug
        } else {
          const step = hop[2] === 'next' ? 1 : -1
          const i = from < 0 ? 0 : (from + step + homes.length) % homes.length
          target = homes[i]!.slug
        }
      }
      res.writeHead(302, { Location: target ? `/@${target}/` : '/ring/', 'Cache-Control': 'no-store' })
      return void res.end()
    }

    // Published sites: /@slug/...
    const pub = /^\/@([a-z0-9-]+)(\/.*)?$/.exec(path)
    if (pub) {
      const slug = pub[1]!
      if (!SLUG.test(slug)) throw new HttpError(404, 'Not found')
      const row = site(slug)
      if (row && row.open !== 1) return closedPage(res)
      if (!pub[2]) {
        res.writeHead(301, { Location: `/@${slug}/` })
        return void res.end()
      }
      for (const [k, v] of Object.entries(SITE_HEADERS)) res.setHeader(k, v)
      return serveFile(req, res, join(sitesDir, slug), pub[2])
    }

    // The editor app.
    if (opts.appDir) return serveFile(req, res, resolve(opts.appDir), path === '/' ? '/index.html' : path)
    throw new HttpError(404, 'Not found')
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      const status = e instanceof HttpError ? e.status : 500
      if (!(e instanceof HttpError)) console.error(e)
      if (res.headersSent) return void res.destroy()
      const msg = e instanceof HttpError ? e.message : 'Server error'
      if ((req.url ?? '').startsWith('/api/')) json(res, status, { error: msg })
      else {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(status === 404 ? 'Not found' : msg)
      }
    })
  })
  server.requestTimeout = 60_000
  server.headersTimeout = 15_000

  return {
    server,
    close: () =>
      new Promise((r) => {
        server.close(() => {
          db.close()
          r()
        })
        server.closeAllConnections()
      }),
  }
}

// Run directly: node server/index.ts
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8787)
  const dataDir = resolve(process.env.DATA_DIR ?? 'data')
  const appDir = resolve(process.env.APP_DIR ?? 'dist')
  mkdirSync(dataDir, { recursive: true })
  const { server } = createApp({
    dataDir,
    ...(existsSync(appDir) ? { appDir } : {}),
    trustProxy: process.env.TRUST_PROXY === '1',
    ...(process.env.PUBLIC_BASE_URL ? { publicBase: process.env.PUBLIC_BASE_URL } : {}),
  })
  server.listen(port, process.env.HOST ?? '0.0.0.0', () =>
    console.log(`Little Internet on http://localhost:${port}  (data: ${dataDir})`),
  )
}
