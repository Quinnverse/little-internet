// End-to-end check of the acceptance chain on a phone-sized viewport (editor task 10):
// setup → private entry → public entry with photo → pin to room → preview →
// download website → unzip + serve on a plain static host → re-import.
// Needs: `npm run build`, then `node scripts/static-server.mjs dist 4173` and
// `node scripts/static-server.mjs <SITE_DIR> 4174` running. Usage: node scripts/e2e-check.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { chromium } from 'playwright'

const APP = 'http://127.0.0.1:4173/'
const SITE = 'http://127.0.0.1:4174/'
const SITE_DIR = process.env.SITE_DIR ?? '/tmp/li-site'
const SHOTS = process.env.SHOTS ?? 'e2e-shots'
const PHOTO = 'public/icon-512.png'

mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('dialog', (d) => d.accept())

try {
  // 1. Setup
  await page.goto(APP)
  await page.getByLabel('What is your home called?').fill('Moon’s corner')
  await page.screenshot({ path: join(SHOTS, '01-setup.png') })
  await page.getByRole('button', { name: 'Move in' }).click()
  await page.getByRole('heading', { name: 'Room' }).waitFor()
  check('setup creates a home', (await page.locator('.topbar-title').textContent()) === 'Moon’s corner')
  check('new room is not empty', (await page.locator('.tile').count()) === 3)
  await page.screenshot({ path: join(SHOTS, '02-room-new.png') })

  // 2. Private entry
  await page.getByRole('button', { name: 'Diary', exact: true }).click()
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.getByLabel('Title', { exact: true }).fill('Unsent letter')
  await page.getByLabel('Entry', { exact: true }).fill('Not for anyone yet.')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('Only you can see this entry.').waitFor()
  check('new entry defaults to private', (await page.locator('.entry').first().getByText('Private').count()) === 1)

  // 3. Public entry with a photo
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.getByLabel('Title', { exact: true }).fill('First day at the sea')
  await page.getByLabel('Entry', { exact: true }).fill('Salt air.\n\nCold water, warm sand.')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add photos' }).click()
  await (await chooser).setFiles(PHOTO)
  await page.locator('.photo-thumb img').waitFor()
  await page.locator('.door-toggle').getByRole('button', { name: 'Open to visitors' }).click()
  await page.screenshot({ path: join(SHOTS, '03-entry-sheet.png') })
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('Visitors can see this entry.').waitFor()
  check('two entries in diary', (await page.locator('.entry').count()) === 2)
  await page.screenshot({ path: join(SHOTS, '04-diary.png') })

  // 4. Pin both entries to the room
  await page.getByRole('button', { name: 'Room', exact: true }).click()
  for (const title of ['First day at the sea', 'Unsent letter']) {
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.locator('.add-grid').getByRole('button', { name: /Diary entry/ }).click()
    await page.locator('.pick-list button', { hasText: title }).click()
  }
  check('private pinned entry is marked hidden', (await page.getByText('Hidden from visitors').count()) === 1)
  await page.locator('.tile.selected').waitFor()
  await page.screenshot({ path: join(SHOTS, '05-room-pinned.png') })

  // Move the selected block to the top-left and check it really moved.
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await page.getByRole('button', { name: 'Move here: column 1, row 1' }).click()
  const style = await page.locator('.tile.selected').getAttribute('style')
  const box = await page.locator('.tile.selected').evaluate((el) => { const cs = getComputedStyle(el); return `${cs.gridRowStart}/${cs.gridColumnStart}` })
  check('move puts block at row 1, column 1', box === '1/1', `${box} (${style})`)

  // 4b. Owner ghost remembers private and public entries, on the device
  await page.getByRole('button', { name: 'Talk to Boo' }).click()
  await page.getByLabel('When did I last write about…').fill('SAND')
  await page.locator('.memory-list button', { hasText: 'First day at the sea' }).waitFor()
  check('owner ghost finds an entry by word', true)
  const btnColors = await page.getByRole('button', { name: 'Talk to Boo' }).evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor])
  const sheetTitle = await page.locator('.sheet-head h2').evaluate((el) => getComputedStyle(el).color)
  check('sheet title readable inside dark room', sheetTitle === 'rgb(43, 38, 32)', sheetTitle)
  check('ghost button text is readable on dark theme', btnColors[0] !== 'rgb(236, 232, 246)', btnColors.join(' on '))
  await page.getByLabel('When did I last write about…').fill('anyone')
  await page.locator('.memory-list button', { hasText: 'Unsent letter' }).waitFor()
  check('owner ghost also remembers private entries', true)
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(SHOTS, '05b-owner-ghost.png') })
  await page.getByRole('button', { name: 'Close' }).click()

  // 5. Preview shows the generated site, public only
  await page.getByRole('button', { name: 'Preview' }).click()
  const frame = page.frameLocator('.preview-frame')
  await frame.locator('.site-title').waitFor({ timeout: 10000 })
  const previewText = await frame.locator('body').innerText()
  check('preview shows public entry', previewText.includes('First day at the sea'))
  check('preview hides private entry', !previewText.includes('Unsent letter'))
  await frame.locator('.ghost').waitFor({ timeout: 5000 }).then(
    () => check('preview runs ghost.js', true),
    () => check('preview runs ghost.js', false),
  )
  await page.screenshot({ path: join(SHOTS, '06-preview.png') })
  await page.getByRole('button', { name: 'Done' }).click()

  // 6. Download website
  await page.getByRole('button', { name: 'Door', exact: true }).click()
  await page.screenshot({ path: join(SHOTS, '07-door.png'), fullPage: true })
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download website (.zip)' }).click()
  const download = await dl
  const zipPath = join(SHOTS, download.suggestedFilename())
  await download.saveAs(zipPath)
  check('website file name', download.suggestedFilename() === 'moon-s-corner-site.zip', download.suggestedFilename())

  // Unzip into the plain static host under a sub-path.
  const { readFileSync } = await import('node:fs')
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)))
  rmSync(join(SITE_DIR, '@moon'), { recursive: true, force: true })
  for (const [name, data] of Object.entries(entries)) {
    const file = join(SITE_DIR, '@moon', name)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, data)
  }
  const allText = Object.entries(entries)
    .filter(([n]) => !n.startsWith('assets/'))
    .map(([, d]) => new TextDecoder().decode(d))
    .join('\n')
  check('export contains no private entry', !allText.includes('Unsent letter') && !allText.includes('Not for anyone yet'))
  check('export contains the photo', Object.keys(entries).some((n) => n.startsWith('assets/') && n.endsWith('.jpg')))

  // 7. Independent site on another origin, in a fresh context (no service worker, no app)
  // Reduced motion: the bobbing ghost never counts as 'stable' for Playwright clicks.
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const vpage = await visitor.newPage()
  const failed = []
  vpage.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`))
  vpage.on('pageerror', (e) => errors.push(`site: ${e.message}`))
  await vpage.goto(`${SITE}@moon/index.html`)
  await vpage.locator('.ghost').waitFor({ timeout: 5000 })
  check('independent site shows ghost', true)
  const reactText = await vpage.locator('.ghost-bubble').textContent()
  check('ghost reacts to a new entry on arrival', (await vpage.locator('.ghost-wrap').getAttribute('data-state')) === 'react' && reactText === 'Something new: First day at the sea', reactText)
  await vpage.screenshot({ path: join(SHOTS, '08-independent-home.png'), fullPage: true })
  await vpage.locator('.ghost').click()
  await vpage.locator('.ghost-bubble a').first().click()
  await vpage.getByRole('heading', { name: 'First day at the sea' }).waitFor()
  check('ghost guides visitor to the latest entry', true)
  const img = await vpage.locator('article img').evaluate((el) => el.complete && el.naturalWidth > 0)
  check('photo loads on independent host', img)
  await vpage.screenshot({ path: join(SHOTS, '09-independent-post.png'), fullPage: true })
  check('no failed requests on independent host', failed.length === 0, failed.join(', '))
  await visitor.close()

  // 8. Re-import into a fresh editor (new context = empty IndexedDB)
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const fpage = await fresh.newPage()
  fpage.on('dialog', (d) => d.accept())
  await fpage.goto(APP)
  const chooser2 = fpage.waitForEvent('filechooser')
  await fpage.getByRole('button', { name: 'Import website ZIP' }).click()
  await (await chooser2).setFiles(zipPath)
  await fpage.getByRole('heading', { name: 'Room' }).waitFor()
  await fpage.getByRole('button', { name: 'Diary', exact: true }).click()
  const titles = await fpage.locator('.entry strong').allTextContents()
  check('re-import restores public entry', titles.length === 1 && titles[0] === 'First day at the sea', titles.join('|'))
  await fresh.close()

  // 8b. Tablet and desktop: own layout, no horizontal scrolling, centred dialogs
  for (const [label, viewport, isMobile] of [['tablet', { width: 820, height: 1180 }, true], ['desktop', { width: 1280, height: 800 }, false]]) {
    const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile })
    const tp = await ctx.newPage()
    tp.on('pageerror', (e) => errors.push(`${label}: ${e.message}`))
    await tp.goto(APP)
    await tp.getByLabel('What is your home called?').fill('Wide home')
    await tp.getByRole('button', { name: 'Move in' }).click()
    await tp.getByRole('heading', { name: 'Room' }).waitFor()
    const overflow = await tp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`${label}: no horizontal scrolling`, overflow <= 0, `${overflow}px`)
    const navDir = await tp.locator('.tabbar').evaluate((el) => getComputedStyle(el).flexDirection)
    check(`${label}: navigation layout`, label === 'desktop' ? navDir === 'column' : navDir !== 'column', navDir)
    await tp.screenshot({ path: join(SHOTS, `10-${label}-room.png`) })
    await tp.getByRole('button', { name: 'Diary', exact: true }).click()
    await tp.getByRole('button', { name: 'New entry' }).click()
    await tp.waitForTimeout(400) // let the slide-in animation finish
    const box = await tp.locator('.sheet').boundingBox()
    if (label === 'desktop') check('desktop: dialog is centred', box && box.y > 20 && box.y + box.height < viewport.height - 20, JSON.stringify(box))
    await tp.keyboard.press('Escape')
    const closed = await tp.locator('.sheet').waitFor({ state: 'detached', timeout: 2000 }).then(() => true, () => false)
    check(`${label}: Escape closes dialog`, closed)
    await ctx.close()
    const vctx = await browser.newContext({ viewport, isMobile, reducedMotion: 'reduce' })
    const sp = await vctx.newPage()
    await sp.goto(`${SITE}@moon/index.html`)
    const sOverflow = await sp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(`${label}: published site has no horizontal scrolling`, sOverflow <= 0, `${sOverflow}px`)
    await sp.screenshot({ path: join(SHOTS, `11-${label}-site.png`) })
    await vctx.close()
  }

  // 9. Persistence: reload the original editor
  await page.reload()
  await page.getByRole('heading', { name: 'Room' }).waitFor()
  check('editor reloads saved home from IndexedDB', (await page.locator('.tile').count()) === 5)
} catch (e) {
  check('flow completed', false, e instanceof Error ? e.message.split('\n')[0] : String(e))
  await page.screenshot({ path: join(SHOTS, 'zz-failure.png') }).catch(() => {})
} finally {
  check('no page errors', errors.length === 0, errors.join(' | '))
  await browser.close()
  console.log(results.join('\n'))
}
