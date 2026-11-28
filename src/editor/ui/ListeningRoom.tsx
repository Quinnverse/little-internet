import {useEffect,useRef,useState} from 'preact/hooks'
import {idbGet,idbSet} from '../idb.ts'
import {Sheet,assetUrl,type Ctx} from './common.tsx'
import {randomId} from '../ids.ts'

type Disc={id:string;title:string;artist:string;file:File;cover?:string;post?:string}
export function ListeningRoom({ctx,open,close,playing}:{ctx:Ctx;open:boolean;close:()=>void;playing:(v:boolean)=>void}){
 const key='records:'+(ctx.project.privateHome?.libraryId??ctx.project.site.slug),zh=ctx.project.site.lang==='zh'
 const [discs,setDiscs]=useState<Disc[]>([]),[index,setIndex]=useState(0),[url,setUrl]=useState(''),[spinning,spin]=useState(false),[ready,setReady]=useState(false)
 const audio=useRef<HTMLAudioElement>(null),current=discs[index]
 useEffect(()=>{let live=true;idbGet<Disc[]>(key).then(rows=>{if(live){setDiscs(rows??[]);setReady(true)}}).catch(()=>ctx.toast('Storage unavailable','error'));return()=>{live=false}},[key])
 useEffect(()=>{spin(false);playing(false);if(!current){setUrl('');return}const href=URL.createObjectURL(current.file);setUrl(href);return()=>URL.revokeObjectURL(href)},[current?.id])
 async function save(next:Disc[]){try{await idbSet(key,next);setDiscs(next)}catch{ctx.toast(zh?'本机空间不足，唱片未保存':'Record could not be saved on this device','error')}}
 const cover=ctx.project.assets.find(a=>a.id===current?.cover)
 return <><audio ref={audio} src={url||undefined} onPlay={()=>{spin(true);playing(true)}} onPause={()=>{spin(false);playing(false)}} onEnded={()=>{spin(false);playing(false)}} onError={()=>{if(url)ctx.toast(zh?'浏览器无法播放此音频':'This browser cannot play this recording','error')}}/>
 {open&&<Sheet wide title={zh?'今晚听哪一张？':'On the turntable'} onClose={close}>
 <div class="record-console"><div class="record-sleeve" style={cover?{backgroundImage:'url('+assetUrl(cover)+')'}:{}} aria-hidden="true"><div><strong>{current?.title.replace(/\.[^.]+$/,'')??(zh?'留声':'Room tone')}</strong><small>{current?.artist}</small></div></div><div class="listening"><div class={'vinyl '+(spinning?'spinning':'')}><i style={cover?{backgroundImage:'url('+assetUrl(cover)+')'}:{}}/></div><div class={'tonearm '+(spinning?'lowered':'')}/></div></div>
 {discs.length>1&&<div class="record-crate">{discs.map((d,i)=><button aria-pressed={index===i} onClick={()=>setIndex(i)}>{d.title}</button>)}</div>}
 {current&&<><div class="choice-row"><button disabled={!index} onClick={()=>setIndex(index-1)}>◀</button><button onClick={()=>spinning?audio.current?.pause():audio.current?.play().catch(()=>ctx.toast('Playback unavailable','error'))}>{spinning?'Ⅱ':'▶'} {current.title}</button><button disabled={index+1>=discs.length} onClick={()=>setIndex(index+1)}>▶</button></div>
 <label>{zh?'唱片名':'Album'} <input key={current.id} value={current.title} onChange={e=>void save(discs.map((d,i)=>i===index?{...d,title:e.currentTarget.value}:d))}/></label>
 <label>{zh?'音乐人':'Artist'} <input value={current.artist} onChange={e=>void save(discs.map((d,i)=>i===index?{...d,artist:e.currentTarget.value}:d))}/></label>
 <label>{zh?'关联记忆与封面':'Memory and cover'} <select value={current.post??''} onChange={e=>{const p=ctx.project.posts.find(p=>p.id===e.currentTarget.value);void save(discs.map((d,i)=>i===index?{...d,post:p?.id,cover:p?.imageIds[0]}:d))}}><option value="">—</option>{ctx.project.posts.map(p=><option value={p.id}>{p.title}</option>)}</select></label></>}
 <label class="field">{zh?'把自己的音频放上唱片架':'Add your audio to the shelf'}<input disabled={!ready} type="file" accept="audio/*" onChange={async e=>{const f=e.currentTarget.files?.[0];if(!f)return;await save([...discs,{id:randomId(),title:f.name,artist:'',file:f}]);setIndex(discs.length)}}/></label>
 </Sheet>}</>
}
