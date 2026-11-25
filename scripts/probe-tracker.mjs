// Runs the real MediaPipe hand model (the same files the app ships) on still photos, then our pose rules on the
// resulting landmarks. This checks the model -> Hand mapping and the rules on REAL hands. It is not a camera test.
//   IMAGES="a.jpg b.jpg" node scripts/probe-tracker.mjs
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const images = (process.env.IMAGES ?? '').split(/\s+/).filter(Boolean)
const vite = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' })
await vite.listen()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
page.on('console', (m) => m.type() === 'error' && console.log('console.error', m.text()))
await page.goto('http://127.0.0.1:5199/')
// Vite may optimise @mediapipe on first import and reload the page once: warm it up and wait.
await page.evaluate(() => import('/src/perception/tracker.ts').then((m) => m.createHandTracker('IMAGE')).then((t) => t.close())).catch(() => {})
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1500)
const out = []
for (const file of images) {
  const b64 = readFileSync(file).toString('base64')
  const r = await page.evaluate(async (data) => {
    const { createHandTracker } = await import('/src/perception/tracker.ts')
    const g = await import('/src/perception/gestures.ts')
    const img = new Image()
    await new Promise((ok, bad) => ((img.onload = ok), (img.onerror = bad), (img.src = `data:image/jpeg;base64,${data}`)))
    const tr = await createHandTracker('IMAGE')
    const hands = tr.detect(img, 0)
    const info = { delegate: tr.delegate, hands: hands.length, size: [img.naturalWidth, img.naturalHeight], poses: hands.map((h) => ({ score: +h.score.toFixed(2), openPalm: g.isOpenPalm(h), pointing: g.isPointing(h), thumbsUp: g.isThumbsUp(h), pinch: +g.pinchRatio(h).toFixed(2), fingersUp: g.fingersUp(h), thumbOut: g.thumbOut(h) })) }
    tr.close()
    return info
  }, b64)
  console.log(file, JSON.stringify(r))
  out.push(r)
}
await browser.close()
await vite.close()
