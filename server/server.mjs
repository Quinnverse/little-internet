// Little Internet publish service — zero third-party dependencies.
// Node 22+ (native TS type-stripping) + node:http only.
//
// Routes:
//   GET  /healthz                       liveness + readiness
//   GET  /api/v1/site/:username         does a site exist (public metadata)
//   POST /api/v1/publish                create/update a site  { envelope }
//   DELETE /api/v1/publish/:username    unpublish (X-Site-Token header)
//   GET  /@username/<file>              serve the published static site
//
// The publisher credential travels ONLY in the X-Site-Token request header.
// It is never accepted in a JSON body, never logged, and never written into a
// generated site (generateSite / site.json / export ZIP have no such field).
import { createServer } from 'node:http'
import { decodePublishEnvelope, PUBLISH_LIMITS, validateUsername } from '../src/core/publish.ts'
import { generateSite } from '../src/core/generate.ts'
import { SiteStore } from './store.mjs'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/rss+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
}

function ext(name) {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i)
}

function log(level, msg, fields = {}) {
  // Never include request bodies or X-Site-Token in logs.
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields })}\n`)
}

// Optional CORS origin (used only when the editor is served from a different
// origin, e.g. local E2E). Production serves editor + API from one origin, so
// this stays unset by default and no CORS headers are emitted.
let corsOrigin = null
function send(res, status, body, headers = {}) {
  const bytes = typeof body === 'string' ? Buffer.from(body) : body
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' } : {}),
    ...headers,
  })
  res.end(bytes)
}

function json(res, status, obj, extra = {}) {
  send(res, status, `${JSON.stringify(obj)}\n`, { 'Content-Type': 'application/json; charset=utf-8', ...extra })
}

/** Fixed-window rate limiter keyed by client IP. */
export class RateLimiter {
  constructor(limit = 30, windowMs = 60_000) {
    this.limit = limit
    this.windowMs = windowMs
    this.buckets = new Map()
  }
  check(ip) {
    const now = Date.now()
    let b = this.buckets.get(ip)
    if (!b || now - b.start >= this.windowMs) {
      b = { start: now, count: 0 }
      this.buckets.set(ip, b)
    }
    b.count++
    // Opportunistic cleanup to bound memory.
    if (this.buckets.size > 5000) {
      for (const [k, v] of this.buckets) if (now - v.start >= this.windowMs) this.buckets.delete(k)
    }
    return b.count <= this.limit
  }
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let done = false
    req.on('data', (c) => {
      if (done) return
      size += c.length
      if (size > maxBytes) {
        if (!done) {
          done = true
          const e = new Error('Request too large')
          e.code = 'ETOOLARGE'
          reject(e)
          // Do not destroy the socket: let the handler write a clean 413 so the
          // client gets a real HTTP response instead of a connection reset.
          req.resume()
        }
        return
      }
      chunks.push(c)
    })
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)) } })
    req.on('error', (e) => { if (!done) { done = true; reject(e) } })
    req.on('aborted', () => { if (!done) { done = true; reject(new Error('aborted')) } })
  })
}

export function createPublishServer({ store, baseUrl, rateLimit = 30, tokenSalt, trustProxy = false, corsOrigin: cors = null }) {
  const limiter = new RateLimiter(rateLimit)
  const publicBase = (baseUrl || 'https://little.quinnverse.tech').replace(/\/$/, '')
  corsOrigin = cors

  return createServer(async (req, res) => {
    const started = Date.now()
    const url = new URL(req.url, 'http://localhost')
    const path = decodeURIComponent(url.pathname)
    const ip = trustProxy ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress
    const finish = (status, extra) => log('info', 'request', { method: req.method, path, status, ms: Date.now() - started, ip, ...extra })

    try {
      // --- CORS preflight (only when configured) -----------------------------
      if (req.method === 'OPTIONS' && corsOrigin) {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type, x-site-token',
          'Access-Control-Max-Age': '600',
          Vary: 'Origin',
        })
        res.end()
        return finish(204)
      }

      // --- health -------------------------------------------------------------
      if (req.method === 'GET' && path === '/healthz') {
        const sites = await store.list()
        json(res, 200, { status: 'ok', sites: sites.length, service: 'little-internet-publish', v: 1 })
        return finish(200)
      }

      // --- site existence (public) -------------------------------------------
      const siteMatch = path.match(/^\/api\/v1\/site\/([a-z0-9-]+)$/)
      if (req.method === 'GET' && siteMatch) {
        const name = validateUsername(siteMatch[1])
        if (!name.ok) { json(res, 400, { error: name.reason }); return finish(400) }
        const exists = await store.exists(name.value)
        json(res, exists ? 200 : 404, { username: name.value, published: exists })
        return finish(exists ? 200 : 404)
      }

      // --- publish / update ---------------------------------------------------
      if (req.method === 'POST' && path === '/api/v1/publish') {
        if (!limiter.check(ip)) { json(res, 429, { error: 'Too many requests. Try again later.' }); return finish(429) }
        let raw
        try { raw = await readBody(req, PUBLISH_LIMITS.maxRequestBytes) }
        catch (e) {
          if (e.code === 'ETOOLARGE') { json(res, 413, { error: 'Request body too large.' }); return finish(413) }
          throw e
        }
        let envelope
        try { envelope = JSON.parse(raw.toString('utf8')) }
        catch { json(res, 400, { error: 'Body is not valid JSON.' }); return finish(400) }

        const decoded = decodePublishEnvelope(envelope)
        if (!decoded.ok) { json(res, 400, { error: decoded.reason }); return finish(400) }

        const token = req.headers['x-site-token']
        if (typeof token !== 'string' || token.length < PUBLISH_LIMITS.minTokenLength || token.length > PUBLISH_LIMITS.maxTokenLength || !/^[A-Za-z0-9_-]+$/.test(token)) {
          json(res, 400, { error: 'A valid X-Site-Token header is required.' }); return finish(400)
        }

        const { username, project } = decoded.value
        // Reuse the single renderer. baseUrl yields absolute RSS links.
        const files = generateSite(project, { baseUrl: `${publicBase}/@${username}/` })
        try {
          const result = await store.publish(username, token, files)
          const location = `${publicBase}/@${username}/`
          json(res, result.status === 'created' ? 201 : 200, {
            status: result.status,
            username,
            url: location,
            publicPosts: project.posts.length,
          })
          log('info', 'publish', { username, status: result.status, files: files.size })
          return finish(result.status === 'created' ? 201 : 200, { username })
        } catch (e) {
          if (e.code === 'EFORBIDDEN') { json(res, 403, { error: 'That username is taken by another owner.' }); return finish(403, { username }) }
          throw e
        }
      }

      // --- unpublish ----------------------------------------------------------
      const delMatch = path.match(/^\/api\/v1\/publish\/([a-z0-9-]+)$/)
      if (req.method === 'DELETE' && delMatch) {
        if (!limiter.check(ip)) { json(res, 429, { error: 'Too many requests.' }); return finish(429) }
        const name = validateUsername(delMatch[1])
        if (!name.ok) { json(res, 400, { error: name.reason }); return finish(400) }
        const token = req.headers['x-site-token']
        if (typeof token !== 'string' || token.length > PUBLISH_LIMITS.maxTokenLength) {
          json(res, 400, { error: 'X-Site-Token header is required.' }); return finish(400)
        }
        try {
          const removed = await store.unpublish(name.value, token)
          if (!removed) { json(res, 404, { error: 'No published site at that address.' }); return finish(404) }
          log('info', 'unpublish', { username: name.value })
          json(res, 200, { status: 'unpublished', username: name.value })
          return finish(200, { username: name.value })
        } catch (e) {
          if (e.code === 'EFORBIDDEN') { json(res, 403, { error: 'Not the owner of this site.' }); return finish(403) }
          throw e
        }
      }

      // --- serve published site ----------------------------------------------
      const serveMatch = path.match(/^\/@([a-z0-9-]+)(?:\/(.*))?$/)
      if (req.method === 'GET' && serveMatch) {
        const name = validateUsername(serveMatch[1])
        if (!name.ok) { send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' }); return finish(404) }
        let rel = serveMatch[2] ?? 'index.html'
        if (rel === '' || rel.endsWith('/')) rel += 'index.html'
        // Reject traversal before touching the filesystem.
        if (rel.includes('..') || rel.includes('\\') || rel.startsWith('/')) {
          send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' }); return finish(404)
        }
        const file = await store.readSiteFile(name.value, rel)
        if (!file) {
          // Distinguish "never published / unpublished" for operators without
          // leaking owner data: a gone site returns 410, unknown files 404.
          const published = await store.exists(name.value)
          const status = published ? 404 : 410
          send(res, status, status === 410 ? 'Gone — this site is unpublished.' : 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
          return finish(status)
        }
        const inm = req.headers['if-none-match']
        const headers = {
          'Content-Type': MIME[ext(rel)] || 'application/octet-stream',
          ETag: file.etag,
          // no-store: an unpublished site must disappear from the origin at once.
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
          'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; base-uri 'none'; form-action 'none'",
        }
        if (inm === file.etag) { res.writeHead(304, headers); res.end(); return finish(304) }
        send(res, 200, file.bytes, headers)
        return finish(200)
      }

      json(res, 404, { error: 'Not found.' })
      return finish(404)
    } catch (e) {
      log('error', 'unhandled', { method: req.method, path, error: e?.message || String(e) })
      if (!res.headersSent) json(res, 500, { error: 'Internal server error.' })
      else res.end()
      return finish(500)
    }
  })
}
