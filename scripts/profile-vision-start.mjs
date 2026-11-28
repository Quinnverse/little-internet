// Benchmarks local inference with a supplied replay. The replay cannot measure human recognition accuracy.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
if(!process.env.REPLAY)throw Error('Provide REPLAY pointing to a local MJPEG camera fixture')
const browser=await chromium.launch({channel:process.env.PW_CHANNEL,headless:false,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-video-capture='+resolve(process.env.REPLAY)]})
try{
  const page=await browser.newPage({locale:'en-US',viewport:{width:1000,height:720}})
  await page.goto(process.env.BASE??'http://127.0.0.1:4360/')
  await page.getByRole('button',{name:'Try a demo home'}).click()
  await page.getByRole('button',{name:'The Book Nook'}).click()
  await page.getByRole('button',{name:'Skip tour'}).click()
  const rows=[]
  for(const label of ['cold','warm']){
    if(label==='warm')await page.reload()
    await page.locator('.room-canvas').waitFor()
    const ordinary=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/vision/')).length)
    await page.getByRole('button',{name:'Home menu'}).click()
    await page.getByRole('button',{name:'Boo perception'}).click()
    await page.getByRole('button',{name:/Use camera/}).click()
    await page.waitForFunction(()=>performance.getEntriesByName('li-first-frame').length>0,null,{timeout:90000})
    await page.waitForTimeout(3500)
    const row=await page.evaluate(()=>{
      const m=n=>performance.getEntriesByName('li-'+n).at(-1)
      const diff=(end,start)=>m(end)&&m(start)?Math.round(m(end).startTime-m(start).startTime):null
      const fileTimings=performance.getEntriesByType('resource').filter(e=>e.name.includes('/vision/')).map(e=>({name:e.name.split('/').pop(),requestMs:Math.round(e.duration),wireBytes:e.transferSize}))
      const gl=document.querySelector('canvas.room-canvas').getContext('webgl2')
      const ext=gl?.getExtension('WEBGL_debug_renderer_info')
      return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,delegate:m('hand-graph-ready').detail.delegate,files:fileTimings,resolverMs:diff('hand-resolver-ready','hand-resolver-start'),graphInitIncludingAssetIOms:diff('hand-graph-ready','hand-resolver-ready'),firstInferenceMs:diff('first-frame','start'),firstActionMs:diff('first-action','start'),firstAction:m('first-action')?.detail?.kind,actionToNextAnimationFrameMs:diff('feedback-frame','first-action')}
    })
    const track=await page.evaluateHandle(()=>document.querySelector('.home-perception video').srcObject.getVideoTracks()[0])
    await page.getByRole('button',{name:/Stop camera/}).click()
    rows.push({label,ordinaryVisionRequests:ordinary,...row,trackAfterStop:await track.evaluate(t=>t.readyState)})
  }
  const result={input:'Local MJPEG replay of a fixed pose. Timings only; no live gesture-accuracy measurement.',rows}
  writeFileSync(process.env.RESULT??'vision-start.json',JSON.stringify(result,null,2));console.log(result)
}finally{await browser.close()}
