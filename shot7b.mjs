import { chromium } from 'playwright'
const OUT='/Users/zhangqiyun/Doubao/chats/2026-11-28/new-chat-1/shots'
const b=await chromium.launch({channel:'chrome'})
const page=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2})
page.on('console',m=>{if(m.type()==='error')console.log('ERR:',m.text().slice(0,160))})
await page.goto('http://localhost:5174/',{waitUntil:'networkidle'})
await page.waitForTimeout(1500)
await page.getByText('试试示范家园').click().catch(e=>console.log('no demo btn'))
await page.waitForTimeout(800)
await page.screenshot({path:OUT+'/04-demo-list.png'})
console.log('BODY:', (await page.locator('body').innerText()).slice(0,500).replace(/\n/g,' | '))
await b.close()
