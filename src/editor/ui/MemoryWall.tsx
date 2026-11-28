import {useRef,useState} from 'preact/hooks'
import {Sheet,assetUrl,run,type Ctx} from './common.tsx'
import {type WallPin} from '../../core/schema.ts'
import {DrawPad,paintStrokes} from './DrawPad.tsx'
import type {Drawing} from '../../core/strokes.ts'
import {randomId} from '../ids.ts'
import {processPhoto} from '../images.ts'
import {addAsset,addPost,compose} from '../commands.ts'

export function MemoryWall({ctx,close,openLetter}:{ctx:Ctx;close:()=>void;openLetter:(m:{name:string;message:string})=>void}){
 const p=ctx.project,zh=p.site.lang==='zh',pins=p.privateHome?.pins??[]
 const photos=p.posts.flatMap(post=>post.imageIds.map(id=>({post,asset:p.assets.find(a=>a.id===id)!}))).filter(x=>x.asset)
 const [page,setPage]=useState(0),[sel,select]=useState(''),[note,setNote]=useState('')
 const [composer,composeLetter]=useState(false),[handwriting,write]=useState(false)
 const [recipient,setRecipient]=useState(''),[greeting,setGreeting]=useState('')
 async function keepInk(ink:Drawing|null){
   if(!ink){write(false);return}
   try{
     const cv=document.createElement('canvas');cv.width=cv.height=512
     paintStrokes(cv.getContext('2d')!,512,ink.strokes,'#fff8df')
     const blob=await new Promise<Blob|null>(resolve=>cv.toBlob(resolve,'image/png'))
     if(!blob)throw Error()
     const id=randomId(),postId=randomId(),assetId=randomId(),text=zh?'手写便笺':'Handwritten note'
     const pin={id,postId,assetId,text,x:45,y:48,size:24,rotation:3}
     if(run(ctx,compose(addAsset({id:assetId,mime:'image/png',data:new Uint8Array(await blob.arrayBuffer())}),addPost({id:postId,title:text,kind:'photo',body:'',createdAt:new Date().toISOString(),imageIds:[assetId]}),p=>({...p,privateHome:{...p.privateHome,pins:[...(p.privateHome?.pins??[]),pin]}})))){select(id);write(false)}
   }catch{ctx.toast(zh?'手写便笺保存失败':'Could not keep this note','error')}
 }
 const current=photos[Math.min(page,photos.length-1)]
 const board=useRef<HTMLDivElement>(null)
 const drag=useRef<{id:string;x:number;y:number;left:number;top:number}|null>(null)
 const save=(next:WallPin[])=>run(ctx,project=>({...project,privateHome:{...project.privateHome,pins:next}}))
 const patch=(id:string,v:Partial<WallPin>)=>save(pins.map(i=>i.id===id?{...i,...v}:i))
 const add=(text:string,assetId?:string,postId?:string)=>{
   const id=randomId();save([...pins,{id,text,assetId,postId,x:38,y:35,size:26,rotation:-3}]);select(id)
 }
 const selected=pins.find(i=>i.id===sel)
 return <Sheet wide title={zh?'墙上的日子':'Days on the wall'} onClose={close}>
 <div class="pinboard" ref={board}>{pins.map(i=>{
 const a=p.assets.find(a=>a.id===i.assetId)
 return <button data-mount={i.mount??'pin'} class={'paper-pin '+(sel===i.id?'chosen':'')} style={{left:i.x+'%',top:i.y+'%',width:i.size+'%',transform:'translate(-50%,-50%) rotate('+i.rotation+'deg)'}} onClick={()=>select(i.id)}
 onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);select(i.id);drag.current={id:i.id,x:e.clientX,y:e.clientY,left:i.x,top:i.y}}}
 onPointerMove={e=>{const d=drag.current,r=board.current?.getBoundingClientRect();if(!d||!r||d.id!==i.id)return;e.currentTarget.style.left=Math.max(0,Math.min(100,d.left+(e.clientX-d.x)*100/r.width))+'%';e.currentTarget.style.top=Math.max(0,Math.min(100,d.top+(e.clientY-d.y)*100/r.height))+'%'}}
 onPointerCancel={e=>{drag.current=null;e.currentTarget.style.left=i.x+'%';e.currentTarget.style.top=i.y+'%'}}
 onPointerUp={e=>{if(drag.current)patch(i.id,{x:parseFloat(e.currentTarget.style.left),y:parseFloat(e.currentTarget.style.top)});drag.current=null}}>
 {i.moment&&'✉ '}{a&&<img draggable={false} src={assetUrl(a)} alt=""/>}{i.text}</button>})}</div>
 {selected&&<div class="choice-row"><label>{zh?'大小':'Size'}<input type="range" min="10" max="70" value={selected.size} onInput={e=>patch(sel,{size:+e.currentTarget.value})}/></label>
 <label>{zh?'角度':'Angle'}<input type="range" min="-180" max="180" value={selected.rotation} onInput={e=>patch(sel,{rotation:+e.currentTarget.value})}/></label>
 {selected.moment&&<button onClick={()=>openLetter(selected.moment!)}>{zh?'拆开这封信':'Open this letter'}</button>}
 <button onClick={()=>patch(sel,{mount:selected.mount==='tape'?'pin':'tape'})}>{selected.mount==='tape'?(zh?'换图钉':'Use pin'):(zh?'用胶带贴':'Use tape')}</button>
 <button onClick={()=>save([...pins.filter(i=>i.id!==sel),selected])}>{zh?'置顶':'Bring forward'}</button><button onClick={()=>save(pins.filter(i=>i.id!==sel))}>{zh?'从墙上取下':'Unpin'}</button></div>}
 {current&&<div class="album-leaf"><img src={assetUrl(current.asset)} alt={current.post.title}/><p>{current.post.createdAt.slice(0,10)} · {current.post.title}</p>
 <button disabled={page<=0} onClick={()=>setPage(page-1)}>←</button> {page+1}/{photos.length} <button disabled={page>=photos.length-1} onClick={()=>setPage(page+1)}>→</button> <button onClick={()=>add(current.post.title,current.asset.id,current.post.id)}>{zh?'贴到墙上':'Pin this photo'}</button></div>}
 <label>{zh?'把照片放进相册':'Add to album'} <input type="file" accept="image/*" onChange={async e=>{const f=e.currentTarget.files?.[0];if(!f)return;try{const asset={id:randomId(),...await processPhoto(f)};if(run(ctx,compose(addAsset(asset),addPost({id:randomId(),title:f.name.slice(0,80),body:'',imageIds:[asset.id],createdAt:new Date().toISOString(),kind:'photo'}))))setPage(photos.length)}catch{ctx.toast(zh?'照片无法打开':'Could not open photo','error')}}}/></label>
 <div class="choice-row"><input value={note} maxLength={240} placeholder={zh?'写一张便签':'Leave a note'} onInput={e=>setNote(e.currentTarget.value)}/><button disabled={!note.trim()} onClick={()=>{add(note);setNote('')}}>{zh?'贴上':'Pin note'}</button>{['♥','✿','★'].map(x=><button onClick={()=>add(x)}>{x}</button>)}</div>
 <div class="choice-row"><button onClick={()=>write(!handwriting)}>{zh?'写一张手写便笺':'Handwrite a note'}</button>
 <button onClick={()=>composeLetter(!composer)}>{zh?'留一封祝福信':'Leave a wish letter'}</button></div>
 {handwriting&&<DrawPad paper="#fff8df" onDone={keepInk} onCancel={()=>write(false)}/>}
 {composer&&<form class="moment-letter" onSubmit={e=>{e.preventDefault();const id=randomId();save([...pins,{id,text:recipient,x:52,y:40,size:27,rotation:4,moment:{name:recipient,message:greeting}}]);select(id);composeLetter(false);setGreeting('');setRecipient('')}}>
 <label>{zh?'写给':'For'}<input required maxLength={48} value={recipient} onInput={e=>setRecipient(e.currentTarget.value)}/></label><label>{zh?'打开信时读到的话':'Inside the envelope'}<textarea required maxLength={240} value={greeting} onInput={e=>setGreeting(e.currentTarget.value)}/></label><button>{zh?'封好，贴到墙上':'Seal and pin'}</button></form>}
 </Sheet>
}
