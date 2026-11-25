// A kept gift reaches the public web only when the sender allowed it AND the owner made it public.
// Publishes a real site to a running server and reads it back as a stranger would.
//   BASE=http://127.0.0.1:4175 node scripts/e2e-gift-public.mjs
import { randomBytes } from 'node:crypto'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
const { exportSite } = await vite.ssrLoadModule('/src/core/exportZip.ts')
const { BLANK_LETTER } = await vite.ssrLoadModule('/src/core/letter.ts')
const { DEFAULT_PEN, heartStroke } = await vite.ssrLoadModule('/src/core/strokes.ts')
const { createProject, keepGift, setVisibility } = await vite.ssrLoadModule('/src/editor/commands.ts')

const BASE = (process.env.BASE ?? 'http://127.0.0.1:4175').replace(/\/+$/, '')
const results = []
const check = (name, ok, extra = '') => {
  results.push(!!ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}
const slug = `gift-${randomBytes(3).toString('hex')}`
const key = randomBytes(32).toString('hex')
const letter = (word) => ({ ...BLANK_LETTER, items: [{ t: 'text', id: 't1', x: 100, y: 200, rot: 0, scale: 1, text: word, font: 'hand', color: '#3a2a20', size: 40 }, { t: 'drawing', id: 'd1', x: 500, y: 600, rot: 0, scale: 1, drawing: { v: 1, strokes: [heartStroke(500, 500, 250, DEFAULT_PEN)] } }] })
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])
const mk = (n, shareable, word) => keepGift({ postId: `gp-${n}`, giftId: `g-${n}`, assetId: `ga-${n}`, png, from: 'ana', fromTitle: 'Ana', receivedAt: '2026-11-22T10:00:00.000Z', shareable, letter: letter(word), title: `Letter ${n}`, body: word })

let p = createProject({ title: 'Gift home', slug, style: 'blank', ghostName: 'Boo', ghostColor: 'white' })
p = mk('open', true, 'SHAREDWORDS')(p)
p = mk('closed', false, 'PRIVATEWORDS')(p)
p = mk('kept', true, 'ALLOWEDBUTPRIVATE')(p)
p = setVisibility('gp-open', 'public')(p)
let refused = false
try {
  setVisibility('gp-closed', 'public')(p)
} catch {
  refused = true
}
check('the app refuses to publish a gift the sender did not allow', refused)

const put = await fetch(`${BASE}/api/sites/${slug}`, { method: 'PUT', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/zip' }, body: exportSite(p, { baseUrl: `${BASE}/@${slug}/` }) })
check('the server accepts the site', put.ok, String(put.status))

const get = async (path) => {
  const r = await fetch(`${BASE}/@${slug}/${path}`)
  return { status: r.status, text: r.headers.get('content-type')?.match(/text|json|xml|svg/) ? await r.text() : '' }
}
const home = await get('')
const everything = []
const queue = [home.text]
for (const path of ['feed.xml', 'search.json', 'posts/', 'sitemap.xml']) queue.push((await get(path)).text)
const links = [...home.text.matchAll(/posts\/[a-z0-9-]+\.html/g)].map((m) => m[0])
for (const l of new Set(links)) queue.push((await get(l)).text)
const all = queue.join('\n')
check('a stranger can read the shared letter on its page', links.length > 0 && all.includes('gift-letter') && all.includes('SHAREDWORDS'))
check('the page renders the letter as SVG', /<figure class="gift-letter"[^>]*>\s*<svg/.test(all))
check('a gift the sender forbade is nowhere on the public site', !all.includes('PRIVATEWORDS') && !all.includes('Letter closed'))
check('an allowed gift the owner kept private is not public either', !all.includes('ALLOWEDBUTPRIVATE') && !all.includes('Letter kept'))
const asset = await fetch(`${BASE}/@${slug}/assets/ga-closed.png`)
check('its image is not served', asset.status === 404, String(asset.status))
const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed}/${results.length} passed (real server, anonymous reader)`)
await vite.close()
process.exit(failed ? 1 : 0)
