// Dev tool: drive the real app headlessly and take screenshots into SHOTS (default /tmp/shots).
import { createServer } from 'vite'
import { chromium } from 'playwright'
const out = process.env.SHOTS ?? '/tmp/shots'
const [w, h] = (process.argv[2] ?? '390x844').split('x').map(Number)
const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 700, locale: process.env.LOCALE ?? 'en-US' })
const page = await ctx.newPage()
page.on('console', (m) => ['error'].includes(m.type()) && console.log('console:', m.text().slice(0, 300)))
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 400)))
await page.goto('http://localhost:5198/')
await page.waitForSelector('.setup')
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/1-setup-${w}.png` })
await page.fill('.setup input >> nth=0', process.env.NAME ?? 'Moon’s little home')
await page.getByRole('button', { name: /Move in|搬进去/ }).click()
await page.waitForSelector('.home')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/2-home-${w}.png` })
await browser.close()
await server.close()
