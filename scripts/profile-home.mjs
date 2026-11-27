// macOS/Linux: aggregate Chromium CPU time and RSS; no other browser profiles included.
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import os from 'node:os'
const software = process.env.GL === 'software'
const browser = await chromium.launch({ headless:false, args:[
  ...(software ? ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] : []),
  ...(process.env.PROFILE_VIDEO ? ['--use-file-for-fake-video-capture='+process.env.PROFILE_VIDEO] : []),
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
]})
try {
  const context = await browser.newContext({locale:'en-US',viewport:{width:960,height:700},permissions:['camera']})
  const page = await context.newPage()
  const browserCDP = await browser.newBrowserCDPSession()
  const result = {browser:browser.version(), cpu:os.cpus()[0].model, resolution:'960x700 DPR1',
    input:process.env.PROFILE_VIDEO?'HaGRIDv2 hand_heart still frame loop in virtual camera':'Chromium moving test pattern, no detected subject', stages:{}}
  const models = []
  page.on('request', r=>{if(r.url().includes('/vision/')) models.push(new URL(r.url()).pathname)})
  await page.goto(process.env.BASE??'http://127.0.0.1:4219')
  await page.getByRole('button',{name:'Try a demo home'}).click()
  await page.getByRole('button',{name:'The Book Nook'}).click()
  const canvas = page.locator('.scene canvas.room-canvas')
  await canvas.waitFor()
  result.renderer=await canvas.evaluate(c=>{const gl=c.getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})
  async function snapshot(){
    const {processInfo}=await browserCDP.send('SystemInfo.getProcessInfo')
    const rss=execFileSync('ps',['-o','rss=','-p',processInfo.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split(/\s+/).reduce((s,n)=>s+Number(n),0)
    return {cpu:Object.fromEntries(processInfo.map(p=>[p.id,p.cpuTime])),rss:Math.round(rss/1024),t:performance.now()}
  }
  async function measure(name){
    await page.waitForTimeout(2500)
    const before=await snapshot()
    const frames=await page.evaluate(()=>new Promise(resolve=>{
      const frames=[];let last
      function tick(t){if(last!==undefined)frames.push(t-last);last=t
        if(frames.reduce((a,b)=>a+b,0)>=8000)resolve(frames);else requestAnimationFrame(tick)}
      requestAnimationFrame(tick)
    }))
    const after=await snapshot()
    const elapsed=frames.reduce((s,n)=>s+n,0)
    frames.sort((a,b)=>a-b)
    const pct=q=>+frames[Math.ceil(q*frames.length)-1].toFixed(1)
    const sec=Object.entries(after.cpu).reduce((s,[id,t])=>s+(t-(before.cpu[id]??t)),0)
    result.stages[name]={frames:frames.length,fps:+(1000*frames.length/elapsed).toFixed(1),p50ms:pct(.5),p95ms:pct(.95),
      cpuOneCorePercent:+(100000*sec/(after.t-before.t)).toFixed(1),browserRssMiB:after.rss}
    console.log(name,result.stages[name])
  }
  await measure('home');result.ordinaryVisionRequests=models.slice()
  await page.getByRole('button',{name:'Boo perception'}).click()
  for(const [name,hand,face] of [['hands',true,false],['face',false,true],['both',true,true]]){
    const options=page.locator('.home-perception details')
    await options.locator('summary').click()
    await page.getByLabel(/Hand gestures ·/).setChecked(hand)
    await page.getByLabel(/Face movements/).setChecked(face)
    await page.getByRole('button',{name:/Use camera/}).click()
    await page.locator('.cam-live').waitFor({timeout:120000})
    await measure(name)
    const track=await page.evaluateHandle(()=>document.querySelector('.home-perception video').srcObject.getTracks()[0])
    await page.getByRole('button',{name:/Stop camera/}).click()
    result.stages[name].trackAfterStop=await track.evaluate(t=>t.readyState)
  }
  await page.getByRole('button',{name:'Boo perception'}).click()
  await measure('stopped')
  writeFileSync(process.env.RESULT??'profile.json',JSON.stringify(result,null,2))
} finally {await browser.close()}
