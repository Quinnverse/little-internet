// Screenshots the demo homes from a running server (desktop + phone) into SHOTS.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:4180'
const SHOTS = process.env.SHOTS ?? '.demo-run/shots'
mkdirSync(SHOTS, { recursive: true })
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [w, h, tag] of [[1440, 900, 'desk'], [390, 844, 'phone']]) {
  const c = await b.newContext({ viewport: { width: w, height: h } })
  const p = await c.newPage()
  for (const s of ['the-book-nook', 'somewhere-by-the-sea', 'the-midnight-internet']) {
    await p.goto(`${SERVER}/@${s}/`)
    await p.getByRole('button', { name: /Skip to website/ }).click({ timeout: 8000 }).catch(() => {})
    await p.waitForTimeout(600)
    await p.screenshot({ path: `${SHOTS}/${s}-${tag}.png`, fullPage: tag === 'phone' })
    console.log(s, tag, 'overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth))
  }
  await c.close()
}
await b.close()
