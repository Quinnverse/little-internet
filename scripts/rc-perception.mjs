// An artificial moving test pattern exercises inference cost and lifecycle, not gesture accuracy.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
const dir=process.env.SHOTS??'.rc-perception'
mkdirSync(dir,{recursive:true})
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
try {
 const ctx=await browser.newContext({viewport:{width:960,height:700},permissions:['camera']})
 const page=await ctx.newPage()
 const vision=[]
 page.on('request',r=>{if(r.url().includes('/vision/'))vision.push(new URL(r.url()).pathname)})
 await page.goto(process.env.BASE??'http://localhost:4219')
 await page.getByRole('button',{name:'Try a demo home'}).click()
 await page.getByRole('button',{name:'The Book Nook'}).click()
 await page.locator('.home .scene canvas').waitFor()
 const fps=()=>page.evaluate(()=>new Promise(resolve=>{const start=performance.now();let count=0;function frame(t){if(t-start>=4000)resolve(Math.round(10000*count/(t-start))/10);else{count++;requestAnimationFrame(frame)}}requestAnimationFrame(frame)}))
 const ordinary=await fps()
 const coldRequests=[...vision]
 await page.getByRole('button',{name:'Boo perception'}).click()
 await page.getByText('Perception options',{exact:false}).click()
 await page.getByLabel(/Face movements/).check()
 await page.getByRole('button',{name:/Use camera/}).click()
 await page.locator('.cam-live').waitFor({timeout:90000})
 const combined=await fps()
 const track=await page.evaluateHandle(()=>document.querySelector('.home-perception video').srcObject.getVideoTracks()[0])
 await page.screenshot({path:dir+'/home-perception.png'})
 await page.getByRole('button',{name:/Stop camera/}).click()
 const stopped=await track.evaluate(t=>t.readyState)
 await page.getByRole('button',{name:'Boo perception'}).click()
 const recovery=await fps()
 await page.setViewportSize({width:390,height:844})
 await page.waitForTimeout(1000)
 await page.screenshot({path:dir+'/mobile-home.png'})
 await page.setViewportSize({width:960,height:700})
 await page.mouse.move(470,350)
 await page.mouse.wheel(0,-460)
 await page.waitForTimeout(1000)
 await page.screenshot({path:dir+'/close-up.png'})
 const report={input:'Chromium artificial video pattern; software WebGL; desktop host',ordinary,combined,recovery,coldRequests,vision,stopped}
 writeFileSync(dir+'/performance.json',JSON.stringify(report,null,2))
 console.log(report)
 if(coldRequests.length||stopped!=='ended'||!vision.some(v=>v.includes('face_landmarker')))throw Error('Lifecycle check failed')
} finally {await browser.close()}
