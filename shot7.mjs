import { chromium } from 'playwright'
const OUT='/Users/zhangqiyun/Doubao/chats/2026-11-28/new-chat-1/shots'
const b=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--enable-unsafe-webgpu']})
const page=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2})
page.on('console',m=>{if(m.type()==='error')console.log('ERR:',m.text().slice(0,200))})
await page.goto('http://localhost:5174/',{waitUntil:'networkidle'})
await page.screenshot({path:OUT+'/01-landing.png'})
const demo=page.getByRole('button',{name:'Try a demo home'})
if(await demo.count()){await demo.click().catch(()=>{}); await page.waitForTimeout(800)
  const pick=page.getByRole('button',{name:/Book Nook|Midnight Internet/}).first()
  if(await pick.count()){await pick.click().catch(()=>{})} else await page.screenshot({path:OUT+'/01b-demos.png'})
}
await page.waitForTimeout(9000)
await page.screenshot({path:OUT+'/02-room.png'})
// open the handbook from the dock
const gear=page.locator('.dock-btn[aria-label*="etting"], .dock-btn[aria-label*="设置"]').last()
if(await gear.count())await gear.click().catch(e=>console.log('gear fail'))
await page.waitForTimeout(900)
await page.screenshot({path:OUT+'/03-handbook.png'})
await b.close()
