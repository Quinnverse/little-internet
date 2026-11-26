// Heart Mail across two separate browser profiles (two "devices": separate IndexedDB, keys and storage)
// talking to the real server. This is automation in Chromium, NOT two real phones and NOT Safari.
//   BASE=http://127.0.0.1:4173 node scripts/e2e-mail.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const BASE = (process.env.BASE ?? 'http://127.0.0.1:4173').replace(/\/+$/, '') + '/'
const SHOTS = process.env.SHOTS ?? '.e2e-mail'
mkdirSync(SHOTS, { recursive: true })
const run = Math.random().toString(36).slice(2, 7)
const A = `ann-${run}`
const B = `ben-${run}`
const results = []
const check = (name, ok, extra = '') => {
  results.push(!!ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
async function device(slug, title) {
  const ctx = await browser.newContext({ ...(process.env.VIDEOS ? {recordVideo:{dir:process.env.VIDEOS}} : {}), viewport: { width: 1000, height: 900 }, locale: 'en-US' })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('li-flat', '1')
    } catch {}
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  [${slug}] pageerror: ${e.message}`))
  await page.goto(BASE)
  await page.locator('.setup').waitFor({ timeout: 30000 })
  await page.getByPlaceholder('Moon’s little home').fill(title)
  await page.locator('details.more-opts summary').click()
  await page.locator('input[aria-invalid]').fill(slug)
  await page.getByRole('button', { name: 'Move in' }).click()
  await page.locator('.home').waitFor({ timeout: 30000 })
  return { ctx, page, slug }
}
const openPeople = async (d, tab) => {
  await d.page.getByRole('button', { name: 'Letters' }).click()
  await d.page.getByRole('tab', { name: new RegExp(tab) }).waitFor()
  await d.page.getByRole('tab', { name: new RegExp(tab) }).click()
}
const closeSheet = (d) => d.page.getByRole('dialog').last().getByRole('button', { name: 'Close' }).click()

const a = await device(A, 'Ann home')
const b = await device(B, 'Ben home')

// ---- identity + friendship
await openPeople(a, 'Friends')
await a.page.getByRole('button', { name: 'Send request' }).waitFor()
await openPeople(b, 'Friends')
await b.page.getByRole('button', { name: 'Send request' }).waitFor()
await a.page.getByLabel(/friend's home address/i).fill(B)
await a.page.getByRole('button', { name: 'Send request' }).click()
await a.page.getByText(/Request sent/).waitFor()
check('A sends a friend request to B', true)
await closeSheet(b)
await openPeople(b, 'Friends')
await b.page.getByText('wants to be friends').waitFor({ timeout: 10000 })
check('B sees the request from A', true)
await b.page.getByRole('button', { name: 'Accept' }).click()
await b.page.getByText(`@${A}`).first().waitFor()
check('B accepts: A is B\'s friend', true)
await closeSheet(a)
await openPeople(a, 'Friends')
await a.page.getByText(`@${B}`).first().waitFor({ timeout: 10000 })
check('A now sees B as a friend (mutual)', true)
await closeSheet(a)

// ---- send a letter A -> B (golden path)
await openPeople(a, 'Inbox')
await a.page.getByRole('dialog').getByRole('button', { name: 'Write', exact: true }).click()
await a.page.getByRole('button', { name: 'Thinking of you' }).click()
await a.page.getByRole('button', { name: /Choose who gets it/ }).click()
await a.page.getByRole('radio').first().check()
const sendBtn = a.page.getByRole('button', { name: 'Send', exact: true })
await sendBtn.click()
await a.page.locator('[data-state="sent"]').waitFor({ timeout: 10000 })
check('A: UI says delivered only after the server accepted', true)
await a.page.screenshot({ path: join(SHOTS, 'a-sent.png') })
await a.page.getByRole('button', { name: 'Done' }).click()

// ---- B receives, reads, keeps, hangs it
await closeSheet(b)
await openPeople(b, 'Inbox')
const row = b.page.locator('.mail-row.unread').first()
await row.waitFor({ timeout: 25000 })
check('B: letter arrives in the inbox as unread', true)
await b.page.screenshot({ path: join(SHOTS, 'b-inbox.png') })
await row.click()
await b.page.getByText('The sender keeps this one private').waitFor()
check('B: a letter sent without "may show publicly" is marked private', true)
await b.page.locator('.letter-open svg').waitFor()
check('B: the letter is drawn', (await b.page.locator('.letter-open svg text').allTextContents()).join(' ').includes('Dear night owl'))
await b.page.getByRole('button', { name: 'Keep in my archive' }).click()
await b.page.getByRole('button', { name: 'Kept in archive' }).waitFor()
check('B: keeping creates a private archive entry', true)
await b.page.getByRole('button', { name: 'Put on my wall' }).click()
await b.page.getByRole('button', { name: 'On your wall' }).waitFor()
check('B: the kept letter can be hung on the wall', true)
await b.page.screenshot({ path: join(SHOTS, 'b-open.png') })

// ---- sender state follows reality
await b.page.getByRole('dialog').last().getByRole('button', { name: 'Close' }).click() // closes the opened letter
await closeSheet(a)
await openPeople(a, 'Sent')
await a.page.getByText('read', { exact: true }).first().waitFor({ timeout: 10000 })
check('A: sent list shows the letter as read', true)
await closeSheet(a)

// ---- failure never looks like success; retry is idempotent
await openPeople(a, 'Inbox')
await a.page.getByRole('dialog').getByRole('button', { name: 'Write', exact: true }).waitFor()
await a.page.waitForFunction(() => !document.querySelector('[role=dialog] .btn-primary.btn-small[disabled]'))
await a.page.getByRole('dialog').getByRole('button', { name: 'Write', exact: true }).click()
await a.page.getByRole('button', { name: 'Just a heart' }).click()
await a.page.getByRole('button', { name: /Choose who gets it/ }).click()
await a.page.getByRole('radio').first().check()
await a.ctx.setOffline(true)
await a.page.getByRole('button', { name: 'Send', exact: true }).click()
await a.page.locator('[data-state="failed"]').waitFor({ timeout: 10000 })
check('offline: the UI shows failure, not success', (await a.page.locator('[data-state="sent"]').count()) === 0)
await a.ctx.setOffline(false)
await a.page.getByRole('button', { name: 'Try again' }).click()
await a.page.locator('[data-state="sent"]').waitFor({ timeout: 10000 })
check('retry after reconnect delivers', true)
await a.page.getByRole('button', { name: 'Done' }).click()
await closeSheet(b).catch(() => {})
await openPeople(b, 'Inbox')
await b.page.waitForTimeout(500)
const rows = await b.page.locator('.mail-list .mail-row').count()
check('B has exactly 2 letters (no duplicate from the retry)', rows === 2, `rows=${rows}`)

// ---- block stops delivery, and says so
await b.page.getByRole('tab', { name: /Friends/ }).click()
b.page.on('dialog', (d) => d.accept())
await b.page.getByRole('button', { name: 'Block', exact: true }).first().click()
await b.page.getByText('Blocked', { exact: true }).first().waitFor({ timeout: 10000 })
check('B blocks A', true)
await closeSheet(a).catch(() => {})
await openPeople(a, 'Inbox')
await a.page.getByRole('button', { name: 'Send a heart' }).click({ trial: true }).catch(() => {})
const blockedFriends = await a.page.evaluate(() => 0)
await a.page.getByRole('dialog').getByRole('button', { name: 'Write', exact: true }).click()
await a.page.getByRole('button', { name: 'Just a heart' }).click()
await a.page.getByRole('button', { name: /Choose who gets it/ }).click()
const radios = await a.page.getByRole('radio').count()
if (radios > 0) {
  await a.page.getByRole('radio').first().check()
  await a.page.getByRole('button', { name: 'Send', exact: true }).click()
  await a.page.locator('[data-state="failed"], [data-state="sent"]').first().waitFor({ timeout: 10000 })
  const sentCount = await a.page.locator('[data-state="sent"]').count()
  // A server may hide a block from the sender; what must hold is that B receives nothing.
  await closeSheet(a).catch(() => {})
  await b.page.getByRole('tab', { name: /Inbox/ }).click()
  await b.page.waitForTimeout(500)
  check('blocked sender cannot put a letter in B\'s inbox', (await b.page.locator('.mail-list .mail-row').count()) === 2, `A saw ${sentCount ? 'sent' : 'failed'}`)
} else {
  check('blocked: A can no longer pick B as a recipient', true, String(blockedFriends))
}

for (const device of [a,b]) {
  const video = device.page.video()
  await device.ctx.close()
  if (video && process.env.VIDEOS) {
    await video.saveAs(join(process.env.VIDEOS, device === a ? 'sender.webm' : 'recipient.webm'))
    await video.delete()
  }
}
await browser.close()
const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed}/${results.length} passed (Chromium automation, two profiles, real server; not real devices)`)
process.exit(failed ? 1 : 0)
