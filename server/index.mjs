// Entry point for the publish service.
// Required env: SITE_TOKEN_SALT (a long random secret, keep out of git).
// Optional: DATA_DIR, PORT, HOST, PUBLIC_BASE_URL, RATE_LIMIT, TRUST_PROXY.
import { SiteStore } from './store.mjs'
import { createPublishServer } from './server.mjs'

const tokenSalt = process.env.SITE_TOKEN_SALT
if (!tokenSalt || tokenSalt.length < 16) {
  console.error('SITE_TOKEN_SALT must be set to a long random secret (see .env.example).')
  process.exit(1)
}

const dataDir = process.env.DATA_DIR || new URL('../.data/', import.meta.url).pathname
const host = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || 8788)
const baseUrl = process.env.PUBLIC_BASE_URL || 'https://little.quinnverse.tech'
const rateLimit = Number(process.env.RATE_LIMIT || 30)
const trustProxy = process.env.TRUST_PROXY === '1'

const store = new SiteStore(dataDir, tokenSalt)
await store.init()
const server = createPublishServer({ store, baseUrl, rateLimit, tokenSalt, trustProxy })
server.listen(port, host, () => {
  process.stdout.write(`Little Internet publish service listening on http://${host}:${port} (data: ${dataDir})\n`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)))
}
