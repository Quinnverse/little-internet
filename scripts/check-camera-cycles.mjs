// Browser test pattern only. Instrument counts, never capture frames or facial/hand landmarks.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const browser=await chromium.launch({channel:process.env.PW_CHANNEL,headless:false,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
try {
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,locale:'en-US'})
 const cdp=await browser.newBrowserCDPSession()
 await page.addInitScript(()=>{
   const tracks=new Set()
   const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
   navigator.mediaDevices.getUserMedia=async constraints=>{
     const stream=await gum(constraints);stream.getTracks().forEach(t=>tracks.add(t));return stream
   }
   const refs=[]; const byContext=new WeakMap()
   for(const api of [WebGLRenderingContext,WebGL2RenderingContext]){
     const create=api.prototype.createTexture,del=api.prototype.deleteTexture
     api.prototype.createTexture=function(){const t=create.call(this);if(t){if(!byContext.has(this)){const state={ref:new WeakRef(this),n:0,textures:new WeakSet()};byContext.set(this,state);refs.push(state)}const state=byContext.get(this);state.n++;state.textures.add(t)}return t}
     api.prototype.deleteTexture=function(t){const state=byContext.get(this);if(t && state?.textures.delete(t))state.n--;return del.call(this,t)}
   }
   window.qaResources=()=>({liveTracks:[...tracks].filter(t=>t.readyState==='live').length,textures:[...refs].reduce((n,s)=>{const g=s.ref.deref();return n+(g&&!g.isContextLost()?s.n:0)},0)})
 })
 await page.goto(process.env.BASE??'http://127.0.0.1:4331')
 await page.getByRole('button',{name:'Try a demo home'}).click()
 await page.getByRole('button',{name:'The Book Nook'}).click()
 await page.getByRole('button',{name:'Skip tour'}).click()
 await page.getByRole('button',{name:'Home menu'}).click()
 await page.getByRole('button',{name:'Boo perception'}).click()
 const options=page.locator('.home-perception details').first()
 await options.locator('summary').click()
 await page.getByLabel(/Face movements/).check()
 const stats=async()=>{const {processInfo}=await cdp.send('SystemInfo.getProcessInfo')
 const rss=execFileSync('ps',['-o','rss=','-p',processInfo.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split(/\s+/).reduce((a,v)=>a+Number(v),0)/1024
 return {...await page.evaluate(()=>window.qaResources()),rssMiB:Math.round(rss)}}
 const rows=[]
 for(let i=0;i<5;i++){
  await page.getByRole('button',{name:/Use camera/}).click()
  await page.waitForFunction(i=>performance.getEntriesByName('li-first-frame').length>0,i,{timeout:90000})
  if(i===0){await page.screenshot({path:process.env.SHOT??'camera-preview.png'});await page.getByRole('button',{name:'Hide preview'}).click();await page.locator('.cam-live').waitFor()}
  const on=await stats()
  await page.getByRole('button',{name:/Stop camera/}).click()
  await page.waitForTimeout(1000)
  const session=await page.context().newCDPSession(page);await session.send('HeapProfiler.collectGarbage');await session.detach();
  const off=await stats();rows.push({i:i+1,on,off});console.log(rows.at(-1))
  if(off.liveTracks!==0||on.liveTracks!==1)throw Error('Unexpected track count')
 }
 writeFileSync(process.env.RESULT??'camera-cycles.json',JSON.stringify(rows,null,2))
} finally {await browser.close()}
