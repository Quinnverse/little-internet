// Camera tour: whole house → zoomed to the desk → pan → double-click focus → reset. Saves frames to SHOTS.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const BASE = (process.env.BASE ?? 'http://127.0.0.1:4200') + '/'
const SHOTS = process.env.SHOTS ?? '.v4shots'
mkdirSync(SHOTS, { recursive: true })
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
await p.goto(BASE)
await p.getByRole('button', { name: 'Try a demo home' }).click()
await p.getByRole('button', { name: process.env.DEMO ?? 'The Book Nook' }).click()
const c = p.locator('.home .scene canvas')
await c.waitFor({ timeout: 30000 })
await p.waitForTimeout(2500)
const box = await c.boundingBox()
const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
const shot = async (n) => { await p.waitForTimeout(1300); await p.screenshot({ path: `${SHOTS}/camera-${n}.png` }) }
await shot('0-whole')
// zoom toward the desk with the wheel (cursor over the room)
await p.mouse.move(...at(0.5, 0.45))
for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, -260); await p.waitForTimeout(60) }
await shot('1-zoom')
for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, -260); await p.waitForTimeout(60) }
await shot('2-zoom-close')
// pan with shift-drag
await p.keyboard.down('Shift')
await p.mouse.move(...at(0.5, 0.5)); await p.mouse.down(); await p.mouse.move(...at(0.2, 0.5), { steps: 8 }); await p.mouse.up()
await p.keyboard.up('Shift')
await shot('3-pan')
await p.getByRole('button', { name: 'Reset view' }).click({ timeout: 3000 }).catch(() => {})
await shot('4-reset')
// double click an object that is not a button (the armchair area)
await p.mouse.dblclick(...at(0.5, 0.62))
await shot('5-dblclick')
await b.close()
