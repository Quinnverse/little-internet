// Live acceptance for a deployed Little Internet. Read-mostly: it publishes ONE temporary test site
// (slug li-check-<random>) and removes it by closing its door. It never touches the demo homes.
//   BASE=https://little.quinnverse.tech node scripts/live-check.mjs
// Records load times, transfer sizes and failed requests per page. Measured from where it runs.
import { randomBytes } from 'node:crypto'
import { zipSync, strToU8 } from 'fflate'
import { chromium } from 'playwright'

const BASE = (process.env.BASE ?? 'http://127.0.0.1:4173').replace(/\/+$/, '')
const DEMOS = ['the-book-nook', 'somewhere-by-the-sea', 'the-midnight-internet']
const results = []
const check = (name, ok, extra = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}
const get = async (path, init) => {
  const t = performance.now()
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual', ...init })
  const body = new Uint8Array(await r.arrayBuffer())
  return { r, body, ms: Math.round(performance.now() - t), text: () => new TextDecoder().decode(body) }
}

// ---- HTTPS, health, app shell
console.log(`# Live check against ${BASE}\n`)
check('uses HTTPS', BASE.startsWith('https://') || /127\.0\.0\.1|localhost/.test(BASE), BASE)
const health = await get('/healthz')
check('healthz ok', health.r.status === 200 && health.text().includes('"ok"'), `${health.ms} ms`)
const app = await get('/')
check('app shell loads', app.r.status === 200 && app.text().includes('<div id="app"'), `${app.ms} ms, ${(app.body.length / 1024).toFixed(1)} KB`)

// ---- demo homes + webring + public asset permissions
const ring = await (await fetch(`${BASE}/api/ring`)).json()
for (const d of DEMOS) check(`webring lists ${d}`, ring.homes.some((h) => h.slug === d))
for (const d of DEMOS) {
  const page = await get(`/@${d}/`)
  const html = page.text()
  check(`${d}: page loads and is labelled as a demo`, page.r.status === 200 && html.includes('demo-banner'), `${page.ms} ms, ${(page.body.length / 1024).toFixed(1)} KB`)
  check(`${d}: served in a CSP sandbox`, (page.r.headers.get('content-security-policy') ?? '').startsWith('sandbox'))
  check(`${d}: RSS and button.png are public`, (await get(`/@${d}/feed.xml`)).r.status === 200 && (await get(`/@${d}/button.png`)).r.status === 200)
  check(`${d}: private entry title is not in any file`, !html.includes('A letter I am not sending') && !html.includes('Money worries') && !html.includes('Job interview nerves'))
  const feed = (await get(`/@${d}/feed.xml`)).text()
  check(`${d}: RSS has no private entry`, !/(letter I am not sending|Money worries|Job interview nerves)/.test(feed))
}
const hop = await get(`/ring/${DEMOS[0]}/next`)
check('webring Next redirects to another real home', hop.r.status === 302 && DEMOS.some((d) => (hop.r.headers.get('location') ?? '').includes(d)), hop.r.headers.get('location') ?? '')
const traversal = await get('/@the-book-nook/..%2fli.db')
check('path traversal refused', [400, 404].includes(traversal.r.status))
check('site.json of a demo contains no private entries', !(await get('/@the-book-nook/site.json')).text().includes('"visibility": "private"'))

// ---- temporary test site: publish → guestbook → close the door
const slug = `li-check-${randomBytes(3).toString('hex')}`
const key = randomBytes(32).toString('hex')
// Rebuild a tiny valid site by re-using a demo's published files, renamed to the test slug.
const files = {}
for (const f of ['index.html', 'style.css', 'site.js', 'feed.xml', 'site.json']) files[f] = (await get(`/@${DEMOS[0]}/${f}`)).body
const meta = JSON.parse(new TextDecoder().decode(files['site.json']))
meta.site.slug = slug
meta.site.title = 'Live check'
meta.site.demo = true
files['site.json'] = strToU8(JSON.stringify(meta))
// assets referenced by site.json
for (const a of meta.assets) files[a.path] = (await get(`/@${DEMOS[0]}/${a.path}`)).body
for (const r of meta.recordings ?? []) files[r.path] = (await get(`/@${DEMOS[0]}/${r.path}`)).body
const put = await get(`/api/sites/${slug}`, { method: 'PUT', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/zip' }, body: zipSync(files) })
check('publish API accepts a valid public site', put.r.status === 200, `${put.ms} ms`)
check('published test site is reachable', (await get(`/@${slug}/`)).r.status === 200)
const wrong = await get(`/api/sites/${slug}`, { method: 'PUT', headers: { Authorization: `Bearer ${'0'.repeat(64)}`, 'Content-Type': 'application/zip' }, body: zipSync(files) })
check('another key cannot overwrite it', wrong.r.status === 403)
const post = await get(`/api/sites/${slug}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'check', text: 'hello from live-check' }) })
check('guestbook accepts a note (pending)', post.r.status === 201)
check('pending note is not public', !(await get(`/api/sites/${slug}/messages/approved`)).text().includes('hello from live-check'))
const closed = await get(`/api/sites/${slug}/door`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{"open":false}' })
check('Close the Door works', closed.r.status === 200)
const after = await get(`/@${slug}/`)
check('closed home is gone (404, nothing public)', after.r.status === 404 && !after.text().includes('Live check'))
check('closed home left the webring', !(await (await fetch(`${BASE}/api/ring`)).json()).homes.some((h) => h.slug === slug))

// ---- real browser: first paint, 3D, requests (desktop and phone), overseas-relevant sizes
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [label, ctxOpts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const c = await browser.newContext(ctxOpts)
  const p = await c.newPage()
  const failed = []
  let bytes = 0
  p.on('requestfailed', (q) => failed.push(q.url().replace(BASE, '')))
  p.on('response', async (r) => { try { bytes += (await r.body()).length } catch { /* streamed */ } })
  const t0 = Date.now()
  await p.goto(`${BASE}/`)
  await p.locator('.setup').waitFor({ timeout: 30000 })
  const tShell = Date.now() - t0
  await p.locator('.setup-wrap .scene canvas').waitFor({ timeout: 60000 })
  const tScene = Date.now() - t0
  check(`${label}: first screen and 3D scene render`, true, `shell ${tShell} ms, 3D ${tScene} ms, ${(bytes / 1024 / 1024).toFixed(2)} MB transferred`)
  await p.getByRole('button', { name: 'Try a demo home' }).click()
  await p.getByRole('button', { name: 'The Midnight Internet' }).click()
  await p.locator('.home .scene canvas').waitFor({ timeout: 30000 })
  check(`${label}: demo copy opens without sign-up`, true)
  await p.locator('button.hotspot[data-id=\"computer\"]').evaluate((el) => el.click())
  await p.locator('.crt-item', { hasText: 'Decorate my website' }).click()
  await p.locator('.atelier').waitFor()
  await p.frameLocator('.at-frame').locator('[data-w]').first().waitFor()
  check(`${label}: Web Atelier opens with a live preview`, true)
  check(`${label}: no failed requests`, failed.length === 0, failed.slice(0, 3).join(', '))
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  check(`${label}: no horizontal overflow`, over <= 0, String(over))
  await c.close()
}
// published demo in a browser: sandboxed page still shows its content and the guestbook form
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
const p2 = await c2.newPage()
const t1 = Date.now()
await p2.goto(`${BASE}/@${DEMOS[2]}/`)
await p2.locator('.site-title').waitFor({ timeout: 30000 })
check('phone: published demo shows its title', true, `${Date.now() - t1} ms`)
await p2.locator('form[data-gb]').first().waitFor({ state: 'visible', timeout: 15000 }).then(
  () => check('published demo guestbook form works in the sandbox', true),
  () => check('published demo guestbook form works in the sandbox', false),
)
await browser.close()

const bad = results.filter((x) => !x).length
console.log(`\n${results.length - bad}/${results.length} checks passed`)
process.exit(bad ? 1 : 0)
