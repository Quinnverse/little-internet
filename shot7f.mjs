import { chromium } from 'playwright'
const OUT='/Users/zhangqiyun/Doubao/chats/2026-11-28/new-chat-1/shots'
const b=await chromium.launch({channel:'chrome'})
const page=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2})
await page.goto('http://localhost:5174/',{waitUntil:'networkidle'})
await page.getByText('试试示范家园').click()
await page.getByText('The Book Nook').click()
await page.waitForTimeout(9000)
await page.screenshot({path:OUT+'/11-day-final.png'})
await page.waitForTimeout(9000)
await page.screenshot({path:OUT+'/12-invite.png'})
await b.close()
