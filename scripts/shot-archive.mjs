import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const BASE = (process.env.BASE ?? 'http://127.0.0.1:4200') + '/'
mkdirSync('.v4shots', { recursive: true })
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [w, h, tag, mobile] of [[1280, 800, 'desk', false], [390, 844, 'phone', true]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile })).newPage()
  await p.goto(BASE)
  await p.getByRole('button', { name: 'Try a demo home' }).click()
  await p.getByRole('button', { name: 'The Book Nook' }).click()
  await p.locator('.home .scene canvas').waitFor({ timeout: 30000 })
  await p.getByRole('button', { name: 'Journal', exact: true }).click()
  await p.waitForTimeout(600)
  await p.screenshot({ path: `.v4shots/archive-${tag}.png` })
  await p.getByRole('button', { name: 'New entry' }).click()
  await p.getByRole('button', { name: 'Reading note', exact: true }).click()
  await p.waitForTimeout(500)
  await p.screenshot({ path: `.v4shots/archive-${tag}-reading-form.png` })
  await p.close()
}
await b.close()
