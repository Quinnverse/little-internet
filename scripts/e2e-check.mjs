// End-to-end check of Little Internet 2.0 in headless Chromium (software WebGL):
//   setup → write private + public entries with keepsakes → decorate → answering machine welcome →
//   publish to the server → a visitor rings the doorbell, hears the welcome, reads a public entry,
//   leaves a guestbook note → owner approves → export ZIP → run it on a different host → re-import.
// Needs `npm run build`, the server on :4173 (APP_DIR=dist) and a static host on :4174 for SITE_DIR.
// Usage: bash scripts/e2e.sh   (starts everything)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const errors = []
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${label}: ${m.text()}`))
  page.on('dialog', (d) => d.accept())
}

const hot = (page, id) => page.locator(`button.hotspot[data-id="${id}"]`)
// Hotspots overlap in a 3D scene, so click them by event instead of by pixel.
const tap = (page, id) => hot(page, id).dispatchEvent('click')
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

const owner = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, permissions: ['microphone'] })
const page = await owner.newPage()
watch(page, 'owner')

try {
  // ------------------------------------------------------------------ 1. Setup
  await page.goto(APP)
  await page.locator('.setup').waitFor()
  await page.locator('.setup-wrap .scene canvas').waitFor()
  check('setup shows the 3D house behind the card', true)
  await page.getByLabel('What is your home called?').fill('Moon’s corner')
  await page.getByRole('button', { name: 'Villa' }).click()
  await page.getByRole('button', { name: 'Cabin' }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(SHOTS, '01-setup.png') })
  check('setup has no horizontal scroll on a phone', await noOverflow(page))
  await page.getByRole('button', { name: 'Move in' }).click()

  // ------------------------------------------------------------------ 2. Home
  await page.locator('.home .scene canvas').waitFor()
  await hot(page, 'diary').waitFor()
  check('home opens on the 3D room with the title', (await page.locator('.home-title h1').textContent()) === 'Moon’s corner')
  for (const id of ['diary', 'computer', 'voice', 'pet', 'shelf', 'window', 'door', 'export']) {
    check(`hotspot: ${id}`, (await hot(page, id).count()) === 1)
  }
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(SHOTS, '02-home-phone.png') })
  const shot = await page.locator('.scene').screenshot()
  check('3D scene renders (not blank)', shot.length > 40_000, `${shot.length} bytes`)
  check('home has no horizontal scroll on a phone', await noOverflow(page))

  // Camera: rotate and reset.
  const az0 = await page.evaluate(() => window.__view?.azimuth ?? null)
  await page.getByRole('button', { name: 'Rotate right' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(SHOTS, '02b-home-rotated.png') })
  await page.getByRole('button', { name: 'Rotate left' }).click()
  void az0

  // ------------------------------------------------------------------ 3. Private entry with a keepsake
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Unsent letter')
  await page.getByLabel('Entry', { exact: true }).fill('Not for anyone yet. TOPSECRETBODY')
  await page.getByRole('button', { name: 'Shell', exact: true }).click()
  await page.screenshot({ path: join(SHOTS, '03-entry-sheet.png') })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Only you can see this entry.').waitFor()
  check('keepsake appears in the room', (await page.locator('button.hotspot[data-id^="memory:"]').count()) === 1)

  // ------------------------------------------------------------------ 4. Public entry with photo and photo frame
  await page.getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('First day at the sea')
  await page.getByLabel('Entry', { exact: true }).fill('Salt air.\n\nCold water, warm sand.')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add photos' }).click()
  await (await chooser).setFiles(PHOTO)
  await page.locator('.photo-thumb img').waitFor()
  await page.getByRole('button', { name: 'Photo frame', exact: true }).click()
  await page.locator('.door-toggle').getByRole('button', { name: 'Open to visitors' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Visitors can see this entry.').waitFor()
  check('second keepsake in the room', (await page.locator('button.hotspot[data-id^="memory:"]').count()) === 2)
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(SHOTS, '04-home-keepsakes.png') })

  // ------------------------------------------------------------------ 5. Journal: same entries, list view
  await page.getByRole('button', { name: 'Journal', exact: true }).click()
  await page.locator('.entry').first().waitFor()
  check('journal lists both entries', (await page.locator('.entry').count()) === 2)
  check('new entries are private by default', (await page.locator('.entry', { hasText: 'Unsent letter' }).getByText('Private').count()) === 1)
  await page.getByLabel('Search entries').fill('sand')
  check('journal search', (await page.locator('.entry').count()) === 1)
  await page.screenshot({ path: join(SHOTS, '05-journal.png') })
  await page.getByRole('button', { name: 'Close' }).click()

  // ------------------------------------------------------------------ 6. Decorate and undo
  await page.getByRole('button', { name: 'Decorate', exact: true }).click()
  await page.locator('.deco').waitFor()
  await page.getByRole('button', { name: 'Sage' }).click()
  await page.getByRole('button', { name: 'Checker' }).click()
  await page.getByRole('tab', { name: 'Furniture' }).click()
  await page.getByRole('button', { name: 'Add Mini bookcase' }).click()
  await page.getByRole('button', { name: 'Rotate', exact: true }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(SHOTS, '06-decorate.png') })
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('tab', { name: 'Style' }).click()
  check('checker floor still chosen after undoing furniture', (await page.getByRole('button', { name: 'Checker' }).getAttribute('aria-pressed')) === 'true')
  await page.getByRole('button', { name: 'Undo' }).click()
  check('undo walks back through changes', (await page.getByRole('button', { name: 'Checker' }).getAttribute('aria-pressed')) === 'false')
  await page.getByRole('button', { name: 'Done' }).click()

  // ------------------------------------------------------------------ 7. Answering machine, welcome message
  const clip = await page.evaluate(async () => {
    const ac = new AudioContext()
    const osc = ac.createOscillator()
    const dest = ac.createMediaStreamDestination()
    osc.frequency.value = 440
    osc.connect(dest)
    osc.start()
    const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' })
    const chunks = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    const done = new Promise((r) => (rec.onstop = r))
    rec.start()
    await new Promise((r) => setTimeout(r, 1500))
    rec.stop()
    await done
    osc.stop()
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))
  })
  const clipPath = join(SHOTS, 'hello.webm')
  writeFileSync(clipPath, new Uint8Array(clip))

  await tap(page, 'voice')
  await page.getByRole('button', { name: 'Record a message' }).click()
  await page.locator('.rec-time').waitFor()
  await page.waitForTimeout(1300)
  await page.getByRole('button', { name: 'Stop & keep' }).click()
  await page.getByText('Message saved.').waitFor()
  check('microphone recording is saved, private', (await page.locator('.rec-item').first().getByText('Private').count()) === 1)
  await page.getByLabel('Message title').first().fill('For later')
  await page.getByLabel('Message title').first().blur()
  const chooser2 = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose audio file' }).click()
  await (await chooser2).setFiles(clipPath)
  await page.locator('.rec-item').nth(1).waitFor()
  const top = page.locator('.rec-item').first()
  await top.getByLabel('Message title').fill('Welcome to my little home')
  await top.getByLabel('Message title').blur()
  await top.getByRole('button', { name: 'Use as welcome message' }).click()
  check('welcome message is chosen', (await top.getByRole('button', { name: 'Welcome message' }).getAttribute('aria-pressed')) === 'true')
  await top.getByRole('button', { name: 'Let visitors hear this' }).click()
  await page.getByText('Visitors can now hear this message.').waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(SHOTS, '07-answering-machine.png') })
  await page.getByRole('button', { name: 'Close' }).click()

  // ------------------------------------------------------------------ 8. The pet remembers (on this device)
  await tap(page, 'pet')
  await page.getByLabel('When did I last write about…').fill('SAND')
  await page.locator('.memory-list button', { hasText: 'First day at the sea' }).waitFor()
  await page.getByLabel('When did I last write about…').fill('anyone')
  await page.locator('.memory-list button', { hasText: 'Unsent letter' }).waitFor()
  check('owner pet remembers public and private entries', true)
  await page.getByRole('button', { name: 'Close' }).click()

  // Night: the window sets the light; lamps, screen and lava lamp glow.
  await tap(page, 'window')
  await page.getByRole('button', { name: 'Night' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(SHOTS, '08a-home-night.png') })
  check('night mode switches the room', (await page.locator('.scene.is-night').count()) === 1)
  await tap(page, 'window')
  await page.getByRole('button', { name: 'Follow time' }).click()
  await page.getByRole('button', { name: 'Close' }).click()

  // The CD on the desk opens the same website panel (download lives there).
  await tap(page, 'export')
  await page.getByRole('button', { name: 'Download website (.zip)' }).waitFor()
  check('CD on the desk opens the website panel', true)
  await page.getByRole('button', { name: 'Close' }).click()

  // ------------------------------------------------------------------ 9. Computer: website, publish
  await tap(page, 'computer')
  await page.getByText('Visitors can see 1 entries and 1 photos.').waitFor()
  check('computer shows what visitors can see', true)
  await page.screenshot({ path: join(SHOTS, '08-computer.png'), fullPage: false })
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByText('Open site:').waitFor({ timeout: 20000 })
  const siteUrl = await page.locator('a', { hasText: 'Open site:' }).getAttribute('href')
  check('published at /@slug/', /\/@moon-s-corner\/$/.test(siteUrl ?? ''), siteUrl ?? '')

  // Preview as a visitor.
  await page.getByRole('button', { name: 'Preview as a visitor' }).click()
  const frame = page.frameLocator('.preview-frame')
  await frame.locator('.site-title').waitFor({ timeout: 15000 })
  const previewText = await frame.locator('body').innerText()
  check('preview hides private entry', !previewText.includes('Unsent letter'))
  await page.getByRole('button', { name: 'Done' }).click()

  // ------------------------------------------------------------------ 10. A visitor arrives (fresh browser, desktop)
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const v = await visitor.newPage()
  watch(v, 'visitor')
  const failed = []
  v.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`))
  await v.goto(siteUrl)
  await v.locator('.li-room').waitFor({ timeout: 15000 })
  await v.getByText('Someone’s home').waitFor()
  await v.waitForTimeout(1500)
  await v.screenshot({ path: join(SHOTS, '09-visitor-door.png') })
  check('visitor sees the front door first', (await v.getByRole('button', { name: 'Ring the doorbell' }).count()) === 1)
  await hot(v, 'mailbox').waitFor({ timeout: 10000 })
  check('mailbox by the path is the guestbook (platform copy)', true)
  const html = await v.content()
  check('no private text on the visitor page', !html.includes('TOPSECRET') && !html.includes('Unsent letter'))
  await v.getByRole('button', { name: 'Ring the doorbell' }).click()
  const card = v.locator('.li-card')
  await card.waitFor({ timeout: 20000 })
  check('welcome message is offered, not autoplayed', (await card.getByRole('button', { name: 'Play' }).count()) === 1)
  await v.screenshot({ path: join(SHOTS, '10-visitor-welcome.png') })
  await card.getByRole('button', { name: 'Play' }).click()
  await card.getByRole('button', { name: 'Pause' }).waitFor({ timeout: 5000 })
  check('visitor can play the owner’s welcome', true)
  await card.getByRole('button', { name: 'Close' }).click()
  check('visitor sees only the public keepsake', (await v.locator('button.hotspot[data-id^="memory:"]').count()) === 1)

  // Guestbook: leave a note.
  await v.getByRole('button', { name: 'Guestbook', exact: true }).click()
  await v.getByLabel('Your name').fill('Ana')
  await v.getByLabel('Your note').fill('Lovely room! <b>hi</b>')
  await v.getByRole('button', { name: 'Send' }).click()
  await v.getByText('Thank you. The owner will see it first.').waitFor()
  check('guestbook note is accepted as pending', true)
  await v.getByRole('button', { name: 'Close' }).click()

  // Tap the keepsake: opens the public entry page.
  await tap(v, (await v.locator('button.hotspot[data-id^="memory:"]').first().getAttribute('data-id')))
  await v.getByRole('heading', { name: 'First day at the sea' }).waitFor({ timeout: 10000 })
  check('keepsake opens the public entry', /posts\/first-day-at-the-sea\.html$/.test(v.url()))
  const img = await v.locator('article img').evaluate((el) => el.complete && el.naturalWidth > 0)
  check('photo loads on the platform copy', img)
  check('no failed requests for the visitor', failed.length === 0, failed.join(' | '))

  // ------------------------------------------------------------------ 11. Owner approves the note
  await tap(page, 'computer')
  await page.getByRole('button', { name: 'Refresh' }).click()
  await page.getByText('Lovely room!').waitFor({ timeout: 10000 })
  check('owner sees the pending note as text', (await page.locator('.msg p').first().textContent()).includes('<b>hi</b>'))
  await page.getByRole('button', { name: 'Show on my site' }).click()
  await page.getByText('Shown', { exact: true }).waitFor()
  await v.goto(siteUrl)
  await v.getByRole('button', { name: 'Skip to website' }).waitFor()
  await v.getByRole('button', { name: 'Ring the doorbell' }).click()
  await v.getByRole('button', { name: 'Guestbook', exact: true }).waitFor({ timeout: 20000 })
  await v.getByRole('button', { name: 'Guestbook', exact: true }).click()
  await v.getByText('Ana: Lovely room!').waitFor()
  check('approved note is public, as text', (await v.locator('.li-msgs b').count()) === 0)
  await v.getByRole('button', { name: 'Close' }).click()
  // Software WebGL is slow: free this page before opening the next one.
  await visitor.close()

  // ------------------------------------------------------------------ 12. Export, back up, run elsewhere
  const dlBackup = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download private backup' }).click()
  const backup = await dlBackup
  const backupPath = join(SHOTS, backup.suggestedFilename())
  await backup.saveAs(backupPath)

  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download website (.zip)' }).click()
  const download = await dl
  const zipPath = join(SHOTS, download.suggestedFilename())
  await download.saveAs(zipPath)
  check('website file name', download.suggestedFilename() === 'moon-s-corner-site.zip', download.suggestedFilename())
  const entries = unzipSync(new Uint8Array(readFileSync(zipPath)))
  rmSync(join(SITE_DIR, '@moon'), { recursive: true, force: true })
  for (const [name, data] of Object.entries(entries)) {
    const file = join(SITE_DIR, '@moon', name)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, data)
  }
  const allText = Object.entries(entries)
    .filter(([n]) => /\.(html|json|xml|css|js)$/.test(n) && n !== 'room.js')
    .map(([, d]) => new TextDecoder().decode(d))
    .join('\n')
  check('export contains no private entry', !allText.includes('Unsent letter') && !allText.includes('TOPSECRET'))
  check('export has room.js and ghost.js', 'room.js' in entries && 'ghost.js' in entries)
  check('export contains only the public welcome recording', Object.keys(entries).filter((n) => n.startsWith('audio/')).length === 1)
  check('export carries no guestbook messages', !allText.includes('Lovely room'))

  const other = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' })
  const o = await other.newPage()
  watch(o, 'other-host')
  const failed2 = []
  o.on('response', (r) => r.status() >= 400 && failed2.push(`${r.status()} ${r.url()}`))
  await o.goto(`${SITE}@moon/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await o.getByRole('button', { name: 'Ring the doorbell' }).waitFor({ timeout: 15000 })
  await o.getByRole('button', { name: 'Ring the doorbell' }).click()
  await o.locator('.li-card').waitFor({ timeout: 20000 })
  check('independent copy: door, room and welcome work on another host', true)
  check('independent copy: no guestbook button off the platform', (await o.getByRole('button', { name: 'Guestbook', exact: true }).count()) === 0)
  check('independent copy: no mailbox hotspot off the platform', (await hot(o, 'mailbox').count()) === 0)
  await o.screenshot({ path: join(SHOTS, '11-independent-room.png') })
  await o.keyboard.press('Escape')
  await o.keyboard.press('Escape')
  await o.locator('.li-room').waitFor({ state: 'detached' })
  await o.locator('.site-title').waitFor()
  check('Escape returns to the plain website', true)
  check('independent copy: nothing failed to load', failed2.length === 0, failed2.join(' | '))

  // ------------------------------------------------------------------ 13. Re-import
  const chooserZip = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import website ZIP' }).click()
  await (await chooserZip).setFiles(zipPath)
  await page.getByText('Home replaced.').waitFor()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Journal', exact: true }).click()
  check('re-import brings back the public entry only', (await page.locator('.entry').count()) === 1)
  await page.getByRole('button', { name: 'Close' }).click()
  check('re-import keeps the public keepsake in the room', (await page.locator('button.hotspot[data-id^="memory:"]').count()) === 1)

  await tap(page, 'computer')
  const chooserBk = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Restore backup' }).click()
  await (await chooserBk).setFiles(backupPath)
  await page.getByText('Home replaced.').waitFor()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Journal', exact: true }).click()
  check('private backup restores private entries', (await page.locator('.entry').count()) === 2)
  await page.getByRole('button', { name: 'Close' }).click()

  // ------------------------------------------------------------------ 14. Persistence and language
  await page.reload()
  await page.locator('.home .scene canvas').waitFor()
  check('everything survives a reload', (await page.locator('button.hotspot[data-id^="memory:"]').count()) === 2)
  await page.getByRole('button', { name: 'Language' }).click()
  await page.getByRole('button', { name: '写日记', exact: true }).waitFor()
  check('switches to Chinese', (await page.locator('html').getAttribute('lang')) === 'zh-CN')
  await page.getByRole('button', { name: '日记', exact: true }).click()
  await page.locator('.entry', { hasText: 'Unsent letter' }).waitFor()
  await page.screenshot({ path: join(SHOTS, '12-chinese-journal.png') })
  await page.getByRole('button', { name: '关闭' }).click()
  await page.getByRole('button', { name: 'Language', exact: false }).or(page.getByRole('button', { name: '语言' })).click()
  await page.getByRole('button', { name: 'Write', exact: true }).waitFor()
  check('switches back to English', true)

  // ------------------------------------------------------------------ 15. Tablet and desktop layouts
  // Software WebGL is slow: close the other scenes first so this page gets frames.
  await other.close()
  const phoneVisitor = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const pv = await phoneVisitor.newPage()
  watch(pv, 'phone-visitor')
  await pv.goto(siteUrl)
  await pv.getByRole('button', { name: 'Ring the doorbell' }).waitFor({ timeout: 20000 })
  await pv.waitForTimeout(1500)
  await pv.screenshot({ path: join(SHOTS, '09b-visitor-door-phone.png') })
  await pv.getByRole('button', { name: 'Ring the doorbell' }).click()
  await pv.locator('.li-card').waitFor({ timeout: 25000 })
  await pv.screenshot({ path: join(SHOTS, '10b-visitor-room-phone.png') })
  check('phone visitor: door, room and welcome', true)
  await phoneVisitor.close()
  await page.goto('about:blank')
  for (const [name, w, h] of [['tablet', 820, 1180], ['desktop', 1280, 800]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true })
    const p = await c.newPage()
    watch(p, name)
    await p.goto(APP)
    await p.getByLabel('What is your home called?').fill(`${name} home`)
    await p.getByRole('button', { name: 'Move in' }).click()
    await p.locator('.home .scene canvas').waitFor()
    await p.waitForTimeout(1500)
    await p.screenshot({ path: join(SHOTS, `13-${name}-home.png`) })
    check(`${name}: no horizontal scroll`, await noOverflow(p))
    await p.getByRole('button', { name: 'Write', exact: true }).click()
    await p.waitForTimeout(500)
    await p.screenshot({ path: join(SHOTS, `14-${name}-sheet.png`) })
    const sheetBox = await p.locator('.sheet').boundingBox()
    check(`${name}: sheet fits the viewport`, !!sheetBox && sheetBox.x >= 0 && sheetBox.x + sheetBox.width <= w + 1 && sheetBox.y >= 0 && sheetBox.y + sheetBox.height <= h + 1)
    await c.close()
  }

  const real = errors.filter((e) => !/favicon|manifest|ERR_FAILED|sw\.js/.test(e))
  check('no unexpected console or page errors', real.length === 0, real.slice(0, 3).join(' | '))
} catch (e) {
  check('e2e ran to the end', false, e instanceof Error ? e.message.split('\n').slice(0, 6).join(' / ') : String(e))
  await page.screenshot({ path: join(SHOTS, 'failure.png') }).catch(() => undefined)
} finally {
  console.log(results.join('\n'))
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} checks passed`)
  await browser.close()
}
