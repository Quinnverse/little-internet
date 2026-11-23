// Site storage for the publish service.
//
// Layout under DATA_DIR:
//   sites/<username>/            the current public site files (served verbatim)
//   meta/<username>.json         owner credential hash + timestamps (never served)
//   trash/<username>.<ts>/       previous version kept briefly for rollback
//
// All filenames come from a validated username and a fixed manifest allow-list;
// no user string is ever used as a filesystem path beyond the username itself.
import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const USERNAME_FS = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

function assertUsername(username) {
  if (typeof username !== 'string' || !USERNAME_FS.test(username)) {
    const e = new Error('Invalid username')
    e.code = 'EINVAL'
    throw e
  }
}

/** Derives a salted hash of a bearer token. Only the hash is persisted. */
export function hashToken(token, salt) {
  return createHash('sha256').update(`${salt}:${token}`).digest('hex')
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export class SiteStore {
  constructor(root, tokenSalt) {
    this.root = resolve(root)
    this.sitesDir = join(this.root, 'sites')
    this.metaDir = join(this.root, 'meta')
    this.trashDir = join(this.root, 'trash')
    this.tokenSalt = tokenSalt
  }

  async init() {
    await Promise.all([
      mkdir(this.sitesDir, { recursive: true }),
      mkdir(this.metaDir, { recursive: true }),
      mkdir(this.trashDir, { recursive: true }),
    ])
    await this._gcTrash()
  }

  _siteDir(username) {
    assertUsername(username)
    return join(this.sitesDir, username)
  }

  _metaFile(username) {
    assertUsername(username)
    return join(this.metaDir, `${username}.json`)
  }

  async _readMeta(username) {
    try {
      return JSON.parse(await readFile(this._metaFile(username), 'utf8'))
    } catch (e) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  }

  /** Returns true only when token matches the stored owner credential hash. */
  async verifyOwner(username, token) {
    const meta = await this._readMeta(username)
    if (!meta || typeof meta.tokenHash !== 'string') return false
    return safeEqualHex(meta.tokenHash, hashToken(token, this.tokenSalt))
  }

  async exists(username) {
    try {
      await stat(this._siteDir(username))
      return true
    } catch (e) {
      if (e.code === 'ENOENT') return false
      throw e
    }
  }

  /**
   * Atomically creates or replaces a site. `expectedMeta` is null for a first
   * publish or { token } for an update — ownership is checked against the hash.
   * Returns { status: 'created' | 'updated' } or throws a coded error.
   */
  async publish(username, token, files) {
    assertUsername(username)
    const already = await this.exists(username)
    if (already) {
      if (!(await this.verifyOwner(username, token))) {
        const e = new Error('Not the owner of this username')
        e.code = 'EFORBIDDEN'
        throw e
      }
    }

    const target = this._siteDir(username)
    const staging = join(this.sitesDir, `.staging.${username}.${process.pid}.${Date.now()}`)
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true, mode: 0o755 })

    try {
      for (const [name, bytes] of files) {
        // Defense in depth: re-check the name even though it came from generateSite.
        if (!SAFE_SITE_FILE.test(name)) throw Object.assign(new Error('Unsafe file name'), { code: 'EBADFILE' })
        const dest = join(staging, name)
        // Ensure the resolved destination stays inside the staging directory.
        if (!dest.startsWith(staging + '/')) throw Object.assign(new Error('Unsafe file path'), { code: 'EBADFILE' })
        await mkdir(join(dest, '..'), { recursive: true })
        await writeFile(dest, bytes, { mode: 0o644 })
      }

      // Meta is written to staging-adjacent temp, swapped after the site dir.
      const metaFile = this._metaFile(username)
      const metaTmp = `${metaFile}.${process.pid}.${Date.now()}.tmp`
      const meta = {
        username,
        tokenHash: hashToken(token, this.tokenSalt),
        publishedAt: already ? (await this._readMeta(username))?.publishedAt ?? new Date().toISOString() : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await writeFile(metaTmp, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 })

      // Atomic swap: keep the old site in trash until the new one is live.
      let backup = null
      if (already) {
        backup = join(this.trashDir, `${username}.${Date.now()}`)
        await rename(target, backup)
      }
      try {
        await rename(staging, target)
        await rename(metaTmp, metaFile)
      } catch (e) {
        // Rollback: restore old site if the new one failed to become live.
        if (backup) await rename(backup, target).catch(() => {})
        await rm(staging, { recursive: true, force: true }).catch(() => {})
        await rm(metaTmp, { force: true }).catch(() => {})
        throw e
      }
      if (backup) await this._gcTrash()
      return { status: already ? 'updated' : 'created' }
    } catch (e) {
      await rm(staging, { recursive: true, force: true }).catch(() => {})
      throw e
    }
  }

  /** Removes a site and its credential. Returns false if it did not exist. */
  async unpublish(username, token) {
    assertUsername(username)
    if (!(await this.exists(username))) return false
    if (!(await this.verifyOwner(username, token))) {
      const e = new Error('Not the owner of this username')
      e.code = 'EFORBIDDEN'
      throw e
    }
    const target = this._siteDir(username)
    const metaFile = this._metaFile(username)
    const trash = join(this.trashDir, `${username}.${Date.now()}.unpublished`)
    await rename(target, trash)
    await rm(metaFile, { force: true })
    await this._gcTrash()
    return true
  }

  /** Returns { bytes, mime, etag } for a served file, or null if not published. */
  async readSiteFile(username, relPath) {
    const dir = this._siteDir(username)
    const file = resolve(join(dir, relPath))
    if (file !== dir && !file.startsWith(dir + '/')) return null
    try {
      const s = await stat(file)
      if (!s.isFile()) return null
      const bytes = await readFile(file)
      return { bytes, etag: `"${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}"` }
    } catch (e) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  }

  async list() {
    const names = await readdir(this.sitesDir).catch(() => [])
    return names.filter((n) => USERNAME_FS.test(n))
  }

  async _gcTrash() {
    // Keep at most a handful of old versions; everything older than 7 days goes.
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000
    let names = await readdir(this.trashDir).catch(() => [])
    for (const n of names) {
      const p = join(this.trashDir, n)
      const s = await stat(p).catch(() => null)
      if (s && s.mtimeMs < cutoff) await rm(p, { recursive: true, force: true }).catch(() => {})
    }
    names = await readdir(this.trashDir).catch(() => [])
    if (names.length > 5) {
      const sorted = (await Promise.all(names.map(async (n) => ({ n, m: (await stat(join(this.trashDir, n)).catch(() => null))?.mtimeMs ?? 0 })))).sort((a, b) => a.m - b.m)
      for (const { n } of sorted.slice(0, names.length - 5)) await rm(join(this.trashDir, n), { recursive: true, force: true }).catch(() => {})
    }
  }
}

/** Only these generated file names are ever written or served. */
const SAFE_SITE_FILE = /^(?:index\.html|style\.css|ghost\.js|feed\.xml|site\.json|assets\/[a-z0-9_-]{1,40}\.(?:jpg|png|webp|gif)|audio\/[a-z0-9_-]{1,40}\.(?:webm|m4a|ogg|mp3)|posts\/[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?\.html)$/
export { SAFE_SITE_FILE }
