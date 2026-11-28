import { chromium } from 'playwright'
const b=await chromium.launch({channel:'chrome'})
const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2})
await p.goto('http://localhost:5174/',{waitUntil:'networkidle'})
await p.getByText('试试示范家园').click(); await p.getByText('The Book Nook').click(); await p.waitForTimeout(8000)
await p.evaluate(()=>{const el=document.querySelector('.hud-scrim'); el.style.background='red'; el.style.zIndex='99'})
await p.screenshot({path:'/tmp/scrimtest.png',clip:{x:0,y:0,width:700,height:200}})
await b.close()
