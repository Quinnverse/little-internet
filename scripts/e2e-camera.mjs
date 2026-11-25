// Camera pipeline end to end with Chromium's FAKE camera playing a looped REAL hand photo.
//   HAND_THUMBS=thumbs.jpg HAND_POINT=pointing.jpg BASE=http://127.0.0.1:4175 node scripts/e2e-camera.mjs
// This proves: consent flow, model loading from this site, detection loop, recogniser, router, UI and release of the
// camera. It does NOT prove behaviour with a real webcam, real motion (waving, pinching) or real lighting.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const BASE = (process.env.BASE ?? 'http://127.0.0.1:4175').replace(/\/+$/, '') + '/'
const OUT = process.env.SHOTS ?? '.e2e-camera'
mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, extra = '') => {
  results.push(!!ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}
const need = (p) => {
  if (!p || !existsSync(p)) {
    console.log(`NOT_TESTED  hand photo missing (${p ?? 'unset'}); set HAND_THUMBS and HAND_POINT`)
    process.exit(2)
  }
  return p
}
const mjpeg = (jpg, name) => {
  const b = readFileSync(jpg)
  const file = join(OUT, name)
  writeFileSync(file, Buffer.concat(Array.from({ length: 150 }, () => b)))
  return file
}
const thumbs = mjpeg(need(process.env.HAND_THUMBS), 'thumbs.mjpeg')
const point = mjpeg(need(process.env.HAND_POINT), 'point.mjpeg')

const launch = (video, grant = true) =>
  chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', ...(grant ? ['--use-fake-ui-for-media-stream'] : []), `--use-file-for-fake-video-capture=${video}`] })

async function home(browser, name, grant = true) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, locale: 'en-US', ...(grant ? { permissions: ['camera'] } : {}) })
  await ctx.addInitScript(() => localStorage.setItem('li-flat', '1'))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  pageerror:', e.message))
  await page.goto(BASE)
  await page.locator('.setup').waitFor({ timeout: 30000 })
  await page.getByPlaceholder('Moon’s little home').fill(name + Math.random().toString(36).slice(2, 6))
  await page.getByRole('button', { name: 'Move in' }).click()
  await page.locator('.home').waitFor({ timeout: 30000 })
  return page
}

// ---- A: thumbs-up photo in front of Boo
{
  const browser = await launch(thumbs)
  const page = await home(browser, 'Cam A ')
  await page.getByRole('button', { name: /Pet/ }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByText(/The camera is off until you press this/).waitFor()
  check('camera is off by default: no stream is attached before the button is pressed', !(await page.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.srcObject))))
  await dlg.getByRole('button', { name: 'Use camera for hand gestures' }).click()
  await dlg.getByText(/Camera on/).waitFor({ timeout: 90000 })
  check('after one press the camera is on with a visible "Camera on" light', true)
  await dlg.getByText('Seen: thumbs up').waitFor({ timeout: 30000 })
  check('a real thumbs-up photo is recognised through the whole pipeline (model, loop, recogniser)', true)
  await page.screenshot({ path: join(OUT, 'boo-thumbs.png') })
  const live = await page.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.srcObject && v.srcObject.getTracks().some((t) => t.readyState === 'live')))
  check('a camera track is live while on', live)
  await dlg.getByRole('button', { name: 'Stop camera' }).click()
  await dlg.getByRole('button', { name: 'Use camera for hand gestures' }).waitFor()
  const after = await page.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.srcObject))
  check('Stop releases the camera (no stream left on the page)', !after)
  await page.getByRole('button', { name: 'Close' }).last().click()
  await browser.close()
}

// ---- B: pointing photo while drawing: the finger moves a cursor but never draws
{
  const browser = await launch(point)
  const page = await home(browser, 'Cam B ')
  await page.getByRole('button', { name: 'Letters' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Write', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('[role=dialog] .btn-primary.btn-small[disabled]'))
  await page.getByRole('dialog').getByRole('button', { name: 'Write', exact: true }).click()
  await page.getByRole('button', { name: 'Draw' }).click()
  const dlg = page.getByRole('dialog').last()
  await dlg.getByRole('button', { name: 'Use camera for hand gestures' }).click()
  await dlg.getByText(/Camera on/).waitFor({ timeout: 90000 })
  await page.waitForTimeout(4000)
  const penText = await dlg.getByText(/pen (up|down)/).textContent()
  check('pointing (no pinch) leaves the pen up: nothing is drawn', /pen up/.test(penText ?? ''), penText ?? '')
  const ink = await page.evaluate(() => {
    const c = document.querySelector('.drawpad-canvas')
    const g = c.getContext('2d')
    const d = g.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] < 200 && d[i + 3] > 0 && !(d[i] > 240)) n++
    return n
  })
  check('canvas stays empty while the finger is only pointing', ink < 50, `dark pixels=${ink}`)
  // mouse still works while the camera is on
  const bb = await page.locator('.drawpad-canvas').boundingBox()
  await page.mouse.move(bb.x + 40, bb.y + 40)
  await page.mouse.down()
  await page.mouse.move(bb.x + 200, bb.y + 120, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Use this drawing' }).waitFor()
  check('the mouse still draws while the camera is on', !(await page.getByRole('button', { name: 'Use this drawing' }).isDisabled()))
  await page.screenshot({ path: join(OUT, 'draw-pointing.png') })
  await browser.close()
}

// ---- C: permission refused: clear message, everything else keeps working
{
  const browser = await launch(thumbs, false)
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, locale: 'en-US' })
  await ctx.addInitScript(() => {
    localStorage.setItem('li-flat', '1')
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
  })
  const page = await ctx.newPage()
  await page.goto(BASE)
  await page.locator('.setup').waitFor()
  await page.getByPlaceholder('Moon’s little home').fill('Cam C ' + Math.random().toString(36).slice(2, 6))
  await page.getByRole('button', { name: 'Move in' }).click()
  await page.locator('.home').waitFor()
  await page.getByRole('button', { name: /Pet/ }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: 'Use camera for hand gestures' }).click()
  await dlg.getByRole('alert').waitFor()
  check('refused permission shows a clear message and no error page', /refused/.test((await dlg.getByRole('alert').textContent()) ?? ''))
  check('the chat still works after a refusal', await dlg.getByRole('log').isVisible())
  await browser.close()
}

const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed}/${results.length} passed (Chromium fake camera looping real hand photos; not a real webcam, no real motion)`)
process.exit(failed ? 1 : 0)
