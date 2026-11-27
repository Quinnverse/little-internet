// Web Atelier end-to-end check in headless Chromium against the real server (scripts/e2e-atelier.sh).
// Walks the acceptance chain: CRT → Web Atelier → restyle → add components → reorder → phone
// preview → save → publish → another device → privacy change → export offline → restore backup.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { unzipSync } from 'fflate'
import { chromium } from 'playwright'

const APP = process.env.APP ?? 'http://127.0.0.1:4173/'
const STATIC = process.env.STATIC ?? 'http://127.0.0.1:4174/'
const SITE_DIR = process.env.SITE_DIR
const SHOTS = process.env.SHOTS ?? '.e2e/shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}
/** The visitor 3D room overlays the page after loading; skip it and wait until it is gone. */
async function skipRoom(pg) {
  const room = pg.locator('.li-room')
  try {
    await room.waitFor({ timeout: 20000 })
  } catch {
    return
  }
  await pg.getByRole('button', { name: /Skip to website/ }).click({ timeout: 10000 }).catch(() => {})
  await room.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
}
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) })

const browser = await chromium.launch({channel:process.env.PW_CHANNEL, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const owner = await browser.newContext({locale:"en-US", ...(process.env.VIDEOS ? {recordVideo:{dir:process.env.VIDEOS}} : {}), viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await owner.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))

// ---- set up a home (Retro style) and two entries
await page.goto(APP)
await page.locator('.setup').waitFor()
await page.locator('.demo-links a').first().waitFor({ timeout: 10000 }).catch(() => {})
check('first screen links to the three published demo homes', (await page.locator('.demo-links a').count()) === 3)
await page.locator('.more-opts summary').click()
await page.getByPlaceholder('Moon’s little home').fill('Pixel Harbor')
await page.getByRole('button', { name: 'Retro Internet' }).click()
await page.getByRole('button', { name: 'Move in' }).click()
await page.locator('.home').waitFor()

async function write(title, body, open) {
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill(title)
  await page.getByLabel('Entry', { exact: true }).fill(body)
  if (open) await page.locator('.door-toggle').getByRole('button', { name: 'Open to visitors' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.sheet').waitFor({ state: 'detached' }).catch(() => {})
  const done = page.getByRole('button', { name: 'Done', exact: true })
  if (await done.count()) await done.first().click()
}
await write('Harbor lights', 'PUBLICBODY the lighthouse blinked twice.', true)
await write('Unsent letter', 'TOPSECRETBODY not for anyone.', false)

// ---- Life Archive: a structured reading note, found by its book, filtered by type, changed in a batch
await page.getByRole('button', { name: 'Journal', exact: true }).click()
await page.getByRole('button', { name: 'New entry' }).click()
await page.getByRole('button', { name: 'Reading note', exact: true }).click()
await page.getByLabel('Title', { exact: true }).fill('Notes on a long novel')
await page.getByLabel('Book', { exact: true }).fill('Middlemarch')
await page.getByLabel('Author', { exact: true }).fill('George Eliot')
await page.getByRole('button', { name: '4 / 5' }).click()
await page.getByLabel('Entry', { exact: true }).fill('Slow and generous.')
await page.getByLabel(/^Tags/).fill('#victorian cozy')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.getByLabel(/Search everything/).fill('eliot')
check('archive: a reading note is found by its author field', (await page.locator('.entry', { hasText: 'Notes on a long novel' }).count()) === 1)
await page.getByLabel(/Search everything/).fill('')
await page.getByRole('tab', { name: /Reading note/ }).click()
check('archive: the Reading note tab shows only reading notes', (await page.locator('.entry').count()) === 1)
await page.getByRole('tab', { name: /^All/ }).click()
check('archive: new records are private', (await page.locator('.entry', { hasText: 'Notes on a long novel' }).getByText('Private').count()) === 1)
await page.getByRole('button', { name: 'Select', exact: true }).click()
await page.locator('.entry', { hasText: 'Notes on a long novel' }).locator('.entry-main').click()
check('archive: selection counts only the chosen record', (await page.locator('.batch-bar strong').textContent()).includes('1'))
page.once('dialog', (d) => d.accept())
await page.locator('.batch-bar').getByRole('button', { name: 'Open to visitors' }).click()
await page.waitForTimeout(300)
check('archive: batch "public" changes the selected records', (await page.locator('.entry', { hasText: 'Notes on a long novel' }).getByText('Public').count()) === 1)
// put it back so the privacy checks below start from the known state
await page.locator('.batch-bar').getByRole('button', { name: 'Just for me' }).click()
await page.getByRole('button', { name: 'Select', exact: true }).click()
await page.locator('.sheet-head button[aria-label="Close"]').last().click()

// ---- Boo 2.0: a continuous conversation in free text; changes need a click
await page.locator('button.hotspot[data-id="pet"]').evaluate((el) => el.click())
const boo = async (msg) => {
  await page.getByLabel(/^Ask .* something/).fill(msg)
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await page.waitForTimeout(250)
}
await boo('hello')
await boo('find my notes about the lighthouse')
const lastTurn = page.locator('.boo-boo').last()
check('boo: finds a record from a free-text question', (await lastTurn.textContent()).includes('Harbor lights'))
await boo('make these private')
check('boo: proposes a change and lists what it would touch', (await page.locator('.boo-proposal').last().textContent()).includes('Harbor lights'))
const stillPublic = await page.evaluate(async () => {
  const req = indexedDB.open('little-internet')
  return await new Promise((res) => { req.onsuccess = () => { const db = req.result; const g = db.transaction('kv').objectStore('kv').get('project'); g.onsuccess = () => res(g.result.posts.find((p) => p.title === 'Harbor lights').visibility) } })
})
check('boo: nothing changes before the owner confirms', stillPublic === 'public')
await page.getByRole('button', { name: 'Not now' }).click()
await boo('make these private')
await page.getByRole('button', { name: /^Yes, change/ }).click()
await page.waitForTimeout(400)
const nowPrivate = await page.evaluate(async () => {
  const req = indexedDB.open('little-internet')
  return await new Promise((res) => { req.onsuccess = () => { const db = req.result; const g = db.transaction('kv').objectStore('kv').get('project'); g.onsuccess = () => res(g.result.posts.find((p) => p.title === 'Harbor lights').visibility) } })
})
check('boo: confirming applies the change', nowPrivate === 'private')
// make it public again for the website steps below
await page.locator('.sheet-head button[aria-label="Close"]').last().click()
await page.getByRole('button', { name: 'Journal', exact: true }).click()
await page.locator('.entry', { hasText: 'Harbor lights' }).locator('.entry-door').click()
await page.locator('.sheet-head button[aria-label="Close"]').last().click()

// ---- 1-3: CRT → Decorate my website
await page.locator('button.hotspot[data-id=\"computer\"]').evaluate((el) => el.click())
await page.locator('.preview-frame').waitFor()
await page.locator('.preview-bar').getByRole('button',{name:'Decorate my website'}).click()
await page.locator('.atelier').waitFor()
const frame = () => page.frameLocator('.at-frame')
await frame().locator('[data-w]').first().waitFor()
check('Web Atelier opens from the CRT with a live preview', (await frame().locator('[data-w]').count()) > 3)
await shot(page, 'atelier-desktop-start')

// ---- 4: background and font
await page.getByRole('tab', { name: 'Style' }).click()
await page.locator('.color-pick', { hasText: 'Colour' }).first().locator('input').evaluate((el) => {
  el.value = '#3a0b4a'
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.getByRole('button', { name: 'Hearts' }).click()
await page.getByLabel('Headings').selectOption('impact')
await page.waitForTimeout(300)
const bg = await frame().locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)
const hfont = await frame().locator('.site-title').evaluate((el) => getComputedStyle(el).fontFamily)
check('background colour changes in the preview', bg === 'rgb(58, 11, 74)', bg)
check('heading font changes in the preview', /Impact/i.test(hfont), hfont)

// ---- 5-6: add guestbook, diary, Boo
await page.getByRole('tab', { name: 'Add' }).click()
const before = await frame().locator('[data-w]').count()
for (const name of ['Guestbook', 'Diary', 'Boo']) await page.locator('.lib-item', { hasText: new RegExp(`^${name}$`) }).click()
await page.waitForTimeout(300)
check('three components added', (await frame().locator('[data-w]').count()) === before + 3)
check('diary component shows the public entry, not the private one', (await frame().locator('.t-diary').last().textContent()).includes('Harbor lights') && !(await frame().locator('body').textContent()).includes('Unsent letter'))

// ---- 7: move a component (select Boo in the preview, move it up twice)
await frame().locator('.t-boo').last().click()
await page.locator('.inspector').waitFor()
const orderBefore = await frame().locator('[data-w]').evaluateAll((els) => els.map((e) => e.getAttribute('data-w')))
await page.locator('.inspector').getByRole('button', { name: 'Move up' }).click()
await page.locator('.inspector').getByRole('button', { name: 'Move up' }).click()
await page.waitForTimeout(300)
const orderAfter = await frame().locator('[data-w]').evaluateAll((els) => els.map((e) => e.getAttribute('data-w')))
const moved = orderBefore.at(-1)
check('component moved up two places', orderAfter.indexOf(moved) === orderBefore.indexOf(moved) - 2)
await page.locator('.inspector').getByRole('button', { name: 'Half' }).first().click().catch(() => {})
// undo / redo
await page.getByRole('button', { name: 'Undo' }).click()
await page.getByRole('button', { name: 'Redo' }).click()
check('undo and redo are available', await page.getByRole('button', { name: 'Undo' }).isEnabled())
await shot(page, 'atelier-desktop-edited')

// ---- 8: phone preview
await page.getByRole('button', { name: 'Phone' }).click()
await page.waitForTimeout(300)
const phoneWidth = await page.locator('.at-frame').evaluate((f) => f.getBoundingClientRect().width)
const overflow = await frame().locator('html').evaluate((h) => h.scrollWidth - h.clientWidth)
check('phone preview is phone-sized', phoneWidth <= 390 && phoneWidth > 300, String(phoneWidth))
check('no horizontal overflow on the phone preview', overflow <= 0, String(overflow))
await shot(page, 'atelier-phone-preview')

// ---- 9-10: save draft, publish
await page.getByRole('button', { name: 'Save draft' }).click()
await page.getByRole('button', { name: 'Publish', exact: true }).click()
await page.getByRole('button', { name: 'Publish now' }).click()
const link = page.getByRole('link', { name: 'Open my website' })
await link.waitFor({ timeout: 20000 })
const url = await link.getAttribute('href')
check('published to its own address', /\/@pixel-harbor\/$/.test(url), url)
await page.getByRole('button', { name: 'Not now' }).click().catch(() => {})
await page.locator('.atelier .sheet-backdrop').click({ position: { x: 5, y: 5 } }).catch(() => {})

// ---- 11-12: another device opens the address
const visitor = await browser.newContext({locale:"en-US", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const vp = await visitor.newPage()
await vp.goto(url)
await skipRoom(vp)
await vp.locator('.site-title').waitFor()
const vbg = await vp.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)
const vtext = await vp.locator('body').textContent()
check('visitor sees the same decoration (background)', vbg === 'rgb(58, 11, 74)', vbg)
check('visitor sees the public entry and never the private one', vtext.includes('Harbor lights') && !vtext.includes('Unsent letter') && !vtext.includes('TOPSECRET'))
await vp.locator('form[data-gb]').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
check('live guestbook form is enabled on the published site', await vp.locator('form[data-gb]').first().isVisible())
const vOverflow = await vp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
check('published site has no horizontal overflow at 390px', vOverflow <= 0, String(vOverflow))
await vp.screenshot({ path: join(SHOTS, 'published-phone.png'), fullPage: true })
const csp = (await (await fetch(url)).headers.get('content-security-policy')) ?? ''
check('published pages are served in a CSP sandbox', csp.startsWith('sandbox'))
// a guestbook note, then the owner approves it
await vp.locator('form[data-gb]').first().locator('input[name="name"]').fill('A neighbour')
await vp.locator('form[data-gb]').first().locator('textarea').fill('Lovely lighthouse!')
await vp.locator('form[data-gb]').first().locator('button').click()
await vp.getByText('Thank you').waitFor({ timeout: 8000 })
check('visitor can sign the guestbook', true)
await visitor.close()

// ---- 13: privacy change updates the live site
await page.locator('.atelier').getByRole('button', { name: /Back home/ }).click()
await page.getByRole('button', { name: 'Journal', exact: true }).click()
await page.locator('.entry', { hasText: 'Harbor lights' }).locator('.entry-door').click()
await page.getByText('Your public website was updated to match.').waitFor({ timeout: 20000 })
const after = await (await fetch(url)).text()
const feed = await (await fetch(`${url}feed.xml`)).text()
check('entry made private disappears from the live page', !after.includes('Harbor lights'))
check('…and from RSS', !feed.includes('Harbor lights'))
const postGone = (await fetch(`${url}posts/harbor-lights.html`)).status
check('…and its old page URL is gone', postGone === 404, String(postGone))
await page.keyboard.press('Escape')

// ---- Close the Door (from the door in the room), then open it again
await page.locator('button.hotspot[data-id=\"door\"]').evaluate((el) => el.click())
await page.locator('.door-state.is-open').waitFor({ timeout: 15000 })
page.once('dialog', (d) => d.accept())
await page.getByRole('button', { name: 'Close the door' }).click()
await page.locator('.door-state.is-closed').waitFor({ timeout: 15000 })
const closedPage = await fetch(url)
const closedRss = await fetch(`${url}feed.xml`)
const ringNow = await (await fetch(`${APP}api/ring`)).json()
check('closing the door takes the website and RSS offline', closedPage.status === 404 && closedRss.status === 404, `${closedPage.status}/${closedRss.status}`)
check('closed page says the door is closed, with no content', (await closedPage.text()).includes('door is closed'))
check('closed home is not in the webring directory', !ringNow.homes.some((h) => h.slug === 'pixel-harbor'))
await page.getByRole('button', { name: 'Open the door again' }).click()
await page.locator('.door-state.is-open').waitFor({ timeout: 20000 })
check('opening the door publishes the site again', (await fetch(url)).status === 200)
await page.keyboard.press('Escape')

// ---- 14-15: export the website and open it offline on another host
await page.getByRole('button',{name:'Website tools'}).click()
await page.locator('.crt-item', { hasText: 'Move my home' }).click()
await page.getByRole('button', { name: 'Skip' }).click().catch(() => {})
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download website ZIP' }).click()])
const zipPath = join(SHOTS, 'site.zip')
await dl.saveAs(zipPath)
const files = unzipSync(new Uint8Array(await (await import('node:fs/promises')).readFile(zipPath)))
check('export has HTML, CSS, JS, RSS and site.json', ['index.html', 'style.css', 'site.js', 'room.js', 'feed.xml', 'site.json'].every((f) => f in files))
const all = Object.entries(files).filter(([n]) => !n.startsWith('assets/')).map(([, b]) => new TextDecoder().decode(b)).join('\n')
check('export contains no private text', !all.includes('TOPSECRET') && !all.includes('Unsent letter'))
if (SITE_DIR) {
  for (const [name, data] of Object.entries(files)) {
    mkdirSync(dirname(join(SITE_DIR, name)), { recursive: true })
    writeFileSync(join(SITE_DIR, name), data)
  }
  const offline = await browser.newContext({locale:"en-US", viewport: { width: 1280, height: 800 } })
  const platformHits = []
  await offline.route(`${APP}**`, (r) => {
    platformHits.push(r.request().url())
    r.abort()
  })
  const op = await offline.newPage()
  await op.goto(`${STATIC}index.html`)
  await skipRoom(op)
  const obg = await op.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)
  check('exported site keeps the decoration on another static host', obg === 'rgb(58, 11, 74)', obg)
  check('guestbook in the export is read-only with a clear note', (await op.locator('[data-gb-status]').first().textContent()).includes('saved copy'))
  check('exported site makes no request to the platform', platformHits.length === 0, platformHits.join(','))
  await op.screenshot({ path: join(SHOTS, 'export-static-host.png'), fullPage: true })
  await offline.close()
}

// ---- 16: private backup → restore in a fresh browser
const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download private backup' }).click()])
const bkPath = join(SHOTS, 'backup.zip')
await bk.saveAs(bkPath)
const widgetCount = await page.evaluate(async () => {
  const req = indexedDB.open('little-internet')
  return await new Promise((res) => {
    req.onsuccess = () => {
      try {
        const db = req.result
        const name = db.objectStoreNames[0]
        const g = db.transaction(name).objectStore(name).get('project')
        g.onsuccess = () => res(g.result?.web?.draft?.widgets?.length ?? -1)
        g.onerror = () => res(-1)
      } catch {
        res(-1)
      }
    }
    req.onerror = () => res(-1)
  })
})
const fresh = await browser.newContext({locale:"en-US", viewport: { width: 1280, height: 800 } })
const fp = await fresh.newPage()
await fp.goto(APP)
await fp.locator('.setup').waitFor()
const [chooser] = await Promise.all([fp.waitForEvent('filechooser'), fp.getByRole('button', { name: 'Restore private backup' }).click()])
fp.once('dialog', (d) => d.accept())
await chooser.setFiles(bkPath)
await fp.locator('.home').waitFor()
await fp.getByRole('button', { name: 'Decorate my website' }).click()
await fp.locator('.atelier').waitFor()
const restored = await fp.frameLocator('.at-frame').locator('[data-w]').count()
check('backup restores the website layout in a fresh browser', restored > 0 && (widgetCount < 0 || restored <= widgetCount), `${restored}/${widgetCount}`)
// Start over: deleting this device's copy brings back the first screen and stays deleted after reload
await fp.locator('.at-bar button').first().click()
fp.once('dialog', (d) => d.accept())
await fp.getByRole('button', { name: 'Settings', exact: true }).click()
await fp.getByRole('button', { name: 'Delete this home from this device' }).click()
await fp.locator('.setup').waitFor({ timeout: 15000 })
await fp.waitForTimeout(1200)
await fp.reload()
await fp.locator('.setup').waitFor({ timeout: 15000 })
check('Start over deletes the device copy and it stays deleted after reload', true)
await fresh.close()
await owner.close()

// ---- 17: Webring to a differently decorated home (demo homes seeded by e2e-atelier.sh)
const walker = await browser.newContext({locale:"en-US", viewport: { width: 1280, height: 800 } })
const wp = await walker.newPage()
await wp.goto(`${APP}@the-midnight-internet/`)
await skipRoom(wp)
const bg1 = await wp.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)
const f1 = await wp.locator('.site-title').evaluate((e) => getComputedStyle(e).fontFamily)
await Promise.all([wp.waitForURL(/@the-book-nook\//, { waitUntil: 'commit' }), wp.locator('.t-webring a', { hasText: 'Next' }).first().click()])
await skipRoom(wp)
const bg2 = await wp.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)
const f2 = await wp.locator('.site-title').evaluate((e) => getComputedStyle(e).fontFamily)
check('webring Next leads to another real home with a different design', bg1 !== bg2 && f1 !== f2, `${bg1} → ${bg2}`)
check('demo homes are labelled as demos', (await wp.locator('.demo-banner').count()) === 1)
await wp.goto(`${APP}ring/`)
check('webring directory lists the three demo homes', (await wp.locator('li').count()) >= 3)
await walker.close()

// ---- Try a demo home: a private copy that can be decorated
const tryCtx = await browser.newContext({locale:"en-US", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const tp = await tryCtx.newPage()
await tp.goto(APP)
await tp.getByRole('button', { name: 'Try a demo home' }).click()
await tp.getByRole('button', { name: 'Somewhere by the Sea' }).click()
await tp.locator('.home').waitFor()
await tp.getByRole('button', { name: 'Decorate my website' }).click()
await tp.locator('.atelier').waitFor()
await tp.frameLocator('.at-frame').locator('[data-w]').first().waitFor()
check('demo copy opens in Web Atelier on a phone', (await tp.frameLocator('.at-frame').locator('[data-w]').count()) > 5)
await tp.screenshot({ path: join(SHOTS, 'atelier-phone-demo.png') })
const barOverflow = await tp.locator('.at-bar').evaluate((b) => b.scrollWidth - b.clientWidth)
const pub = await tp.getByRole('button', { name: 'Publish', exact: true }).boundingBox()
check('phone Atelier bar fits; Publish is fully on screen', barOverflow <= 0 && pub && pub.x + pub.width <= 390, `${barOverflow}`)
await tp.getByRole('tab', { name: 'Style' }).click()
await tp.screenshot({ path: join(SHOTS, 'atelier-phone-drawer.png') })
await tryCtx.close()

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
