// Publishes the three demo homes to a running Little Internet server.
//   SERVER=http://127.0.0.1:4173 KEYS=./data/demo-keys.json node scripts/seed-demo.mjs
// Keys are stored in KEYS (keep that file private). Re-running updates the same sites.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = process.env.SERVER ?? 'http://127.0.0.1:4173'
const keysFile = process.env.KEYS ?? 'data/demo-keys.json'
const keys = existsSync(keysFile) ? JSON.parse(readFileSync(keysFile, 'utf8')) : {}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
try {
  const { seedDemos } = await vite.ssrLoadModule('/src/demo/seed.ts')
  const out = await seedDemos(server, keys)
  writeFileSync(keysFile, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 })
} finally {
  await vite.close()
}
