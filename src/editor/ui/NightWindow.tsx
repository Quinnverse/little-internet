import {useEffect,useRef,useState} from 'preact/hooks'
import {fingersUp,isOpenPalm,pinchRatio,palmCenter} from '../../perception/gestures.ts'
import {windowLandscape} from '../../room3d/landscape.ts'
import {WishCandle} from './WishCandle.tsx'
import {CameraControl} from './CameraControl.tsx'
import {Sheet,run,type Ctx} from './common.tsx'
import {addPost} from '../commands.ts'
import {randomId} from '../ids.ts'

type Spark={x:number;y:number;dx:number;dy:number;life:number;hue:number}
export function NightWindow({ctx,close,letter}:{ctx:Ctx;close:()=>void;letter?:{name:string;message:string}}){
 const zh=ctx.project.site.lang==='zh',cv=useRef<HTMLCanvasElement>(null),sparks=useRef<Spark[]>([])
 const [stage,step]=useState<'sky'|'letter'|'wish'|'after'|'read'>(letter?'read':'sky'),[paused,pause]=useState(false),[sensing,sense]=useState(false)
 const [message,setMessage]=useState(letter?.message??ctx.project.privateHome?.wish??(zh?'愿你每次推门，都有灯等你。':'May there always be a light on when you get home.'))
 const [name,setName]=useState(letter?.name??ctx.project.privateHome?.sign??'WELCOME HOME')
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
 const charge=useRef(0),spread=useRef(1)
 const point=useRef({x:.5,y:.45})
 const add=(x:number,y:number,n:number)=>{if(paused)return;const group=sparks.current,hue=30+Math.random()*22;for(let i=0;i<(reduced?1:n);i++){const a=Math.random()*Math.PI*2,s=.001+Math.random()*.004;group.push({x,y,dx:Math.cos(a)*s*spread.current,dy:Math.sin(a)*s*spread.current,life:1,hue})}if(group.length>420)group.splice(0,group.length-420)}
 const burst=()=>add(point.current.x,point.current.y,75)
 useEffect(()=>{const c=cv.current, g=c?.getContext('2d');if(!c||!g)return;let raf=0,prev=0;const landscape=windowLandscape(1200,650,'midnight')
 const draw=(t:number)=>{const w=c.clientWidth,h=c.clientHeight;if(c.width!==w||c.height!==h){c.width=w;c.height=h}
 const dt=prev?Math.min(2,(t-prev)/16):1;prev=t;g.clearRect(0,0,w,h)
 g.drawImage(landscape,0,0,w,h)
 for(const s of sparks.current){if(!paused){s.x+=s.dx*dt;s.y+=s.dy*dt;s.dy+=.000023*dt;s.life-=.014*dt}g.fillStyle='hsla('+s.hue+',88%,77%,'+Math.max(0,s.life)+')';g.beginPath();g.arc(w*s.x,h*s.y,2.2,0,Math.PI*2);g.fill()}
 sparks.current=sparks.current.filter(s=>s.life>0);raf=requestAnimationFrame(draw)}
 raf=requestAnimationFrame(draw);return()=>cancelAnimationFrame(raf)},[paused])
 function wish(){
   step('after');point.current={x:.5,y:.35};burst()
   if(reduced)return
   const mask=document.createElement('canvas');mask.width=240;mask.height=44;const g=mask.getContext('2d')!
   g.font='bold 32px sans-serif';g.fillStyle='white';g.textAlign='center';g.fillText(name||'♥',120,35,218)
   const data=g.getImageData(0,0,240,44).data
   for(let y=0;y<44;y+=3)for(let x=0;x<240;x+=3)if(data[(y*240+x)*4+3]!>100&&sparks.current.length<420)
    sparks.current.push({x:.08+x/285,y:.12+y/200,dx:0,dy:-.0001,life:1.8,hue:44})
 }
 return <Sheet wide title={zh?'窗外的夜空':'Outside your window'} onClose={close}>
 <div class="night-window"><canvas ref={cv} tabIndex={0} aria-label={zh?'画星光，空格放烟花':'Draw starlight. Space for fireworks'} onKeyDown={e=>{if(e.key===' '){e.preventDefault();burst()}}}
 onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();point.current={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};burst()}}
 onPointerMove={e=>{if(!e.buttons)return;const r=e.currentTarget.getBoundingClientRect();add((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height,3)}}/>
 {stage==='wish'&&<WishCandle zh={zh} onBlow={wish}/>}
 {stage==='after'&&<div class="night-greeting"><strong>{name}</strong><p>{message}</p></div>}</div>
 {stage==='read'?<article class="moment-letter"><strong>{name}</strong><p>{message}</p><button onClick={()=>step('wish')}>{zh?'把灯留给这个愿望':'Light a candle for this wish'}</button></article>:stage==='letter'?<div class="moment-letter"><label>{zh?'灯上的名字':'Name in lights'}<input maxLength={48} value={name} onInput={e=>setName(e.currentTarget.value)}/></label><textarea maxLength={240} value={message} onInput={e=>setMessage(e.currentTarget.value)}/><button onClick={()=>{if(run(ctx,p=>({...p,privateHome:{...p.privateHome,sign:name,wish:message}})))step('wish')}}>{zh?'折好信，点亮蜡烛':'Fold the letter and light a candle'}</button></div>:
 <div class="choice-row"><button onClick={()=>step('letter')}>{stage==='after'?(zh?'再来一次':'Replay'):(zh?'准备一场生日祝福':'Prepare a birthday wish')}</button><button onClick={burst}>{zh?'放一束烟花':'Release fireworks'}</button><button onClick={()=>pause(!paused)}>{paused?'▶':'Ⅱ'}</button>
 {stage==='after'&&<button onClick={()=>{if(run(ctx,addPost({id:randomId(),title:name,body:message,kind:'memo',createdAt:new Date().toISOString(),imageIds:[]})))close()}}>{zh?'收藏这次祝福':'Keep this wish'}</button>}</div>}
 <button class="chip" onClick={()=>sense(!sensing)}>{zh?'用手势画星光':'Paint with your hands'}</button>
 {sensing&&<CameraControl mode="boo" hint="Starlight" onHands={hands=>{
   const h=hands[0];if(!h){charge.current=0;return}
   const c=palmCenter(h),x=1-c.x,y=c.y
   spread.current=hands[1]?Math.max(.45,Math.min(2.5,4*Math.abs(c.x-palmCenter(hands[1]).x))):1
   if(isOpenPalm(h)){if(charge.current&&performance.now()-charge.current>200)add(x,y,100);else add(x,y,1);charge.current=0}
   else if(fingersUp(h).every(v=>!v))charge.current||=performance.now()
   else {charge.current=0;if(pinchRatio(h)<.3)add(x,y,2)}
 }} onAction={a=>{if(a.kind==='cursor'){point.current=a;add(a.x,a.y,4)}else if(a.kind==='boo')burst()}}/>}
 </Sheet>
}
