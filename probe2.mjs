import { chromium } from 'playwright'
const b=await chromium.launch({channel:'chrome'})
const p=await b.newPage({viewport:{width:1440,height:900}})
await p.goto('http://localhost:5174/',{waitUntil:'networkidle'})
await p.getByText('试试示范家园').click(); await p.getByText('The Book Nook').click(); await p.waitForTimeout(8000)
console.log(await p.evaluate(()=>{
  const el=document.querySelector('.hud-scrim')
  if(!el) return 'NO ELEMENT'
  const cs=getComputedStyle(el); const r=el.getBoundingClientRect()
  return JSON.stringify({rect:[r.x,r.y,r.width,r.height], z:cs.zIndex, bg:cs.backgroundImage.slice(0,90), parent:el.parentElement.className, disp:cs.display})
}))
await b.close()
