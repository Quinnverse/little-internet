import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const BASE = (process.env.BASE ?? 'http://127.0.0.1:4200')
const SHOTS = process.env.SHOTS ?? '.v4shots'
mkdirSync(SHOTS, { recursive: true })
const b = await chromium.launch({channel:process.env.PW_CHANNEL,  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [slug, tag] of [['the-book-nook', 'cabin'], ['somewhere-by-the-sea', 'villa']]) {
  const p = await (await b.newContext({ locale:'en-US', viewport: { width: 1000, height: 700 } })).newPage()
  await p.goto(`${BASE}/@${slug}/`)
  await p.locator('.li-room').waitFor({ timeout: 30000 })
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${SHOTS}/${tag}-exterior.png` })
  await p.close()
  const q = await (await b.newContext({ locale:'en-US', viewport: { width: 1000, height: 700 } })).newPage()
  await q.goto(BASE + '/')
  await q.getByRole('button', { name: 'Try a demo home' }).click()
  await q.getByRole('button', { name: tag === 'cabin' ? 'The Book Nook' : 'Somewhere by the Sea' }).click()
  await q.locator('.home .scene canvas').waitFor({ timeout: 30000 })
  await q.waitForTimeout(2500)
  await q.screenshot({ path: `${SHOTS}/${tag}-interior.png` })
  await q.close()
}
await b.close()
