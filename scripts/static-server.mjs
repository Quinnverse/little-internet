// Tiny static file server for local checks: files only, no rewrites, no index fallback
// except "/" → "/index.html" at the root of each served directory.
// Usage: node scripts/static-server.mjs <dir> [listen=4173]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize, extname } from 'node:path'

const root = process.argv[2] ?? 'dist'
const listen = Number(process.argv[3] ?? 4173)
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.webm': 'audio/webm', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
}

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (path.endsWith('/')) path += 'index.html'
  try {
    const body = await readFile(join(root, path))
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(listen, '127.0.0.1', () => console.log(`static: ${root} on ${listen}`))
