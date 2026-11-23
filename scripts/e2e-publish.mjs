// Real-browser E2E for the ONLINE PUBLISH flow and multi-viewport checks.
//
// Starts, in-process: the real Node publish service + a static server for the
// built editor. Drives the editor UI with Playwright:
//   setup home → private + public entry → Door → set API base → publish →
//   visit /@username/ as a fresh visitor → verify public/private isolation →
//   Room theme + ghost + no horizontal overflow at 375/768/1440 →
//   unpublish → origin returns 410.
//
// Usage: after `npm run build`, run `node scripts/e2e-publish.mjs`.
// Needs Playwright Chromium installed (npx playwright install chromium).
import { createServer as httpServer } from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extname, normalize } from 'node:path'
import { randomBytes } from 'node:crypto'
import { chromium } from 'playwright'
import { SiteStore } from '../server/store.mjs'
import { createPublishServer } from '../server/server.mjs'

const API_PORT = 4186
const APP_PORT = 4187
const API = `http://127.0.0.1:${API_PORT}`
const APP = `http://127.0.0.1:${APP_PORT}`
const SHOTS = process.env.SHOTS ?? 'e2e-publish-shots'
const USERNAME = 'e2eowner'

const results = []
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

// --- in-process servers ------------------------------------------------------
const dataDir = await mkdtemp(join(tmpdir(), 'li-e2e-pub-'))
const salt = 'e2e-' + randomBytes(16).toString('hex')
const store = new SiteStore(dataDir, salt)
await store.init()
const publish = createPublishServer({ store, baseUrl: API, rateLimit: 1000, tokenSalt: salt, corsOrigin: APP })
await new Promise((r) => publish.listen(API_PORT, '127.0.0.1', r))

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png' }
const editor = httpServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (p === '/' || p.endsWith('/')) p += 'index.html'
  try {
    const b = await readFile(join('dist', p))
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(b)
  } catch { res.writeHead(404).end('not found') }
})
await new Promise((r) => editor.listen(APP_PORT, '127.0.0.1', r))

const { mkdirSync } = await import('node:fs')
mkdirSync(SHOTS, { recursive: true })

let browser
try {
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
} catch {
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
}
const errors = []
let page

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('dialog', (d) => d.accept())

  // Setup
  await page.goto(APP)
  await page.evaluate((api) => localStorage.setItem('little-internet:publish-api', api), API)
  await page.getByLabel('What is your home called?').fill('E2E corner')
  await page.getByRole('button', { name: 'Move in' }).click()
  await page.getByRole('heading', { name: 'Room' }).waitFor()

  // One private and one public entry
  await page.getByRole('button', { name: 'Diary', exact: true }).click()
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.getByLabel('Title', { exact: true }).fill('PUBLIC E2E NOTE')
  await page.getByLabel('Entry', { exact: true }).fill('visible to visitors')
  await page.locator('.door-toggle').getByRole('button', { name: 'Open to visitors' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.getByLabel('Title', { exact: true }).fill('SECRET E2E NOTE')
  await page.getByLabel('Entry', { exact: true }).fill('never publish me')
  await page.getByRole('button', { name: 'Save' }).click()

  // Room theme (verify it applies in the editor)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('.theme-chip', { hasText: 'Room' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Room', exact: true }).click()
  await page.getByRole('heading', { name: 'Room' }).waitFor()

  // Publish through the real UI
  await page.getByRole('button', { name: 'Door', exact: true }).click()
  await page.getByLabel('Publish username').fill(USERNAME)
  await page.getByRole('button', { name: 'Publish my corner' }).click()
  await page.getByRole('status').waitFor({ timeout: 15000 })
  const liveUrl = await page.getByRole('status').locator('a').getAttribute('href')
  check('UI publish returns a live URL', liveUrl === `${API}/@${USERNAME}/`, liveUrl || '')
  await page.screenshot({ path: join(SHOTS, 'publish-01-after-publish.png') })

  // Fresh visitor context: view the published site
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const v = await visitor.newPage()
  v.on('pageerror', (e) => errors.push(`visitor: ${e.message}`))
  const failed = []
  v.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`))
  await v.goto(`${API}/@${USERNAME}/`)
  await v.locator('.site-title').waitFor()
  const body = await v.locator('body').innerText()
  check('visitor sees public entry', body.includes('PUBLIC E2E NOTE'), body.slice(0, 80))
  check('visitor does NOT see private entry', !body.includes('SECRET E2E NOTE'))
  check('Room theme applied on published site', await v.evaluate(() => document.body.classList.contains('theme-room')))
  await v.locator('.ghost').waitFor({ timeout: 5000 })
  check('ghost is operable on published site', true)
  await v.locator('.ghost').click()
  await v.locator('.ghost-bubble').waitFor()
  check('ghost bubble opens on click', true)
  await v.screenshot({ path: join(SHOTS, 'publish-02-visitor-phone.png'), fullPage: true })

  // Multi-viewport: no horizontal overflow at 375 / 768 / 1440
  for (const [label, width, height] of [['phone-375', 375, 812], ['tablet-768', 768, 1024], ['desktop-1440', 1440, 900]]) {
    const c = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800, reducedMotion: 'reduce' })
    const p2 = await c.newPage()
    await p2.goto(`${API}/@${USERNAME}/`)
    await p2.locator('.site-title').waitFor()
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`${label}: no horizontal overflow`, overflow <= 0, `${overflow}px`)
    await p2.screenshot({ path: join(SHOTS, `publish-03-${label}.png`), fullPage: true })
    await c.close()
  }
  check('no failed requests on published site', failed.length === 0, failed.join(', '))
  await visitor.close()

  // Unpublish via the UI (button returns to first-publish state)
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await page.getByRole('button', { name: 'Publish my corner' }).waitFor({ timeout: 15000 })
  const after = await fetch(`${API}/@${USERNAME}/`)
  check('after unpublish origin returns 410', after.status === 410, String(after.status))
  await ctx.close()

  check('no page/console errors', errors.length === 0, errors.join(' | '))
} catch (e) {
  check('flow completed', false, e instanceof Error ? e.message.split('\n').slice(0, 6).join(' | ') : String(e))
  await page?.screenshot({ path: join(SHOTS, 'publish-zz-failure.png') }).catch(() => {})
} finally {
  await browser.close()
  await new Promise((r) => publish.close(r))
  await new Promise((r) => editor.close(r))
  await rm(dataDir, { recursive: true, force: true })
  console.log(results.join('\n'))
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} checks passed`)
}
