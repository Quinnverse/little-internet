import {useEffect,useState} from 'preact/hooks'
import {idbGet,idbSet} from '../idb.ts'
import {addPost,updatePost} from '../commands.ts'
import {randomId} from '../ids.ts'
import {Sheet,run,assetUrl,type Ctx} from './common.tsx'

export function TapeShelf({ctx,close}:{ctx:Ctx;close:()=>void}){
 const p=ctx.project,zh=p.site.lang==='zh',rows=p.posts.filter(x=>x.kind==='collection'&&x.tags.includes('cinema'))
 const [selected,select]=useState(''),[title,setTitle]=useState(''),[body,setBody]=useState(''),[cover,setCover]=useState(''),[date,setDate]=useState(''),[source,setSource]=useState('')
 const row=rows.find(x=>x.id===selected),key='tape:'+p.site.slug+':'+selected
 useEffect(()=>{let valid=true,url='';setSource('');if(selected)void idbGet<File>(key).then(f=>{if(valid&&f){url=URL.createObjectURL(f);setSource(url)}});return()=>{valid=false;if(url)URL.revokeObjectURL(url)}},[key])
 useEffect(()=>()=>{if(source)URL.revokeObjectURL(source)},[source])
 function choose(id:string){const v=rows.find(x=>x.id===id);select(id);setTitle(v?.title??'');setBody(v?.body??'');setCover(v?.imageIds[0]??'');setDate(v?.fields.where??'')}
 function save(){const id=row?.id??randomId(),values={title,body,fields:{where:date},imageIds:cover?[cover]:[]}
  if(run(ctx,row?updatePost(id,values):addPost({id,...values,createdAt:new Date().toISOString(),kind:'collection',tags:['cinema']})))select(id)
 }
 return <Sheet wide title={zh?'录像带柜':'Video library'} onClose={close}><div class="tape-shelf">{rows.map(r=><button class="tape" onClick={()=>choose(r.id)}>{r.title}</button>)}<button onClick={()=>choose('')}>＋</button></div>
 {source&&<video class="tape-video" key={source} controls src={source} onError={()=>ctx.toast(zh?'这个文件无法播放':'Unsupported video','error')}/>}
 <label class="field">{zh?'片名':'Title'}<input maxLength={120} value={title} onInput={e=>setTitle(e.currentTarget.value)}/></label>
 <input type="date" aria-label="Screening date" value={date} onInput={e=>setDate(e.currentTarget.value)}/><textarea maxLength={12000} placeholder={zh?'那天一起看电影的人、散场后的感想…':'Who was there? What stayed with you?'} value={body} onInput={e=>setBody(e.currentTarget.value)}/>
 <select aria-label="Cover photo" value={cover} onChange={e=>setCover(e.currentTarget.value)}><option value="">{zh?'相册封面':'Album cover'}</option>{p.posts.flatMap(x=>x.imageIds.map((id,i)=><option value={id}>{x.title} · {i+1}</option>))}</select>
 {cover&&p.assets.some(a=>a.id===cover)&&<img style={{maxHeight:'90px'}} src={assetUrl(p.assets.find(a=>a.id===cover)!)}/>}
 <button disabled={!title.trim()} onClick={save}>{zh?'收进档案':'Save to archive'}</button>
 {selected&&<label class="field">{zh?'放入自己的视频（仅本机）':'Insert your video (this device)'}<input type="file" accept="video/*" onChange={async e=>{const file=e.currentTarget.files?.[0];if(!file)return;try{await idbSet(key,file);setSource(old=>{if(old)URL.revokeObjectURL(old);return URL.createObjectURL(file)})}catch{ctx.toast('Storage unavailable','error')}}}/></label>}
 </Sheet>
}
