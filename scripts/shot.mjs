// Dev tool: screenshot a harness page headlessly with software WebGL.
// usage: node scripts/shot.mjs "<path?query>" out.png [width height]
import { createServer } from 'vite'
import { chromium } from 'playwright'
const [, , url = '/harness/room.html', out = '/tmp/shot.png', w = '900', h = '700'] = process.argv
const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('console:', m.text().slice(0, 300)))
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 400)))
await page.goto('http://localhost:5199' + url)
await page.waitForFunction('window.ready === true', null, { timeout: 30000 }).catch(() => console.log('not ready'))
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
await browser.close()
await server.close()
