import { chromium } from 'playwright'
const b=await chromium.launch({channel:'chrome'})
const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1})
await p.goto('http://localhost:5174/',{waitUntil:'networkidle'})
await p.getByText('试试示范家园').click()
await p.getByText('The Book Nook').click()
await p.waitForTimeout(8000)
console.log(await p.evaluate(()=>{
  const t=document.querySelector('.home-title'); const h=document.querySelector('.home-title h1'); const pp=document.querySelector('.home-title p')
  const r=(e)=>e?{...e.getBoundingClientRect().toJSON(), text:e.textContent, lh:getComputedStyle(e).lineHeight, fs:getComputedStyle(e).fontSize, ov:getComputedStyle(e).overflow, op:getComputedStyle(e).opacity}:null
  const st=document.querySelector('.hud-top')
  return JSON.stringify({title:r(t), h1:r(h), p:r(pp), pad:st?getComputedStyle(st).paddingTop:null, safeTop:getComputedStyle(document.documentElement).getPropertyValue('--safe-top')})
}))
await b.close()
