import { chromium } from 'playwright'
const b=await chromium.launch({channel:'chrome'})
const p=await b.newPage({viewport:{width:1440,height:900}})
await p.goto('http://localhost:5174/',{waitUntil:'networkidle'})
await p.getByText('试试示范家园').click(); await p.getByText('The Book Nook').click(); await p.waitForTimeout(9000)
console.log(await p.evaluate(()=>{
  const c=document.querySelector('.room-canvas')
  const names=[]
  // three keeps the scene on the renderer? walk from canvas via __three? not exposed; use DOM dataset fallback
  return c? 'canvas ok':'no'
}))
await b.close()
