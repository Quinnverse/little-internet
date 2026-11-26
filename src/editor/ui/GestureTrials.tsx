import { useEffect, useRef, useState } from 'preact/hooks'
type Trial = {target:string; distance:string; lighting:string; events:{action:string;ms:number}[]; durationMs:number}
export type TrialSink = {current:((action:string)=>void)|null}

/** Deliberate, local-only QA. Records event names and timings after the tester presses Start. */
export function GestureTrials({sink,zh,enabled}:{sink:TrialSink;zh:boolean;enabled:boolean}) {
  const [target,setTarget]=useState('heart')
  const [distance,setDistance]=useState('60 cm')
  const [lighting,setLighting]=useState('daylight')
  const [active,setActive]=useState(false)
  const [rows,setRows]=useState<Trial[]>([])
  const pending=useRef<{start:number;events:Trial['events']}|null>(null)
  useEffect(()=>{
    sink.current=action=>{
      const run=pending.current
      if(run && run.events.length<100 && run.events.at(-1)?.action!==action)run.events.push({action,ms:Math.round(performance.now()-run.start)})
    }
    return ()=>{sink.current=null}
  },[])
  function finish(){
    const run=pending.current
    if(!run)return
    setRows(old=>[...old,{target,distance,lighting,events:run.events,durationMs:Math.round(performance.now()-run.start)}])
    pending.current=null;setActive(false)
  }
  useEffect(()=>{ if (!enabled) finish() },[enabled])
  function download(){
    const a=document.createElement('a')
    a.href=URL.createObjectURL(new Blob([JSON.stringify({input:'tester-selected physical camera',trials:rows},null,2)],{type:'application/json'}))
    a.download='boo-gesture-trials.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
  }
  return <details class="cam-guide"><summary>{zh?'真人动作验收':'Physical camera trials'}</summary>
    <p>{zh?'打开摄像头，双手先离开画面。点开始，做一次动作，再点结束。静止一轮用于记录误触。':'Start the camera with your hands out of frame. Start a trial, perform one action, then finish. Use a still trial to check false triggers.'}</p>
    <fieldset disabled={active}>
      <label>{zh?'动作':'Action'} <select value={target} onChange={e=>setTarget(e.currentTarget.value)}>
        {Object.entries({heart:'比心',wave:'挥手',open_palm:'张开手掌',pointer_move:'食指移动',hand_lost:'手部离开',smile:'微笑',blink:'眨眼',still:'静止'}).map(([k,v])=><option value={k}>{zh?v:k}</option>)}
      </select></label>
      <label>{zh?'距离':'Distance'} <select value={distance} onChange={e=>setDistance(e.currentTarget.value)}>{['30 cm','60 cm','90 cm'].map(v=><option>{v}</option>)}</select></label>
      <label>{zh?'光线':'Light'} <select value={lighting} onChange={e=>setLighting(e.currentTarget.value)}>{Object.entries({daylight:'自然光',dim:'暗光',backlit:'逆光'}).map(([k,v])=><option value={k}>{zh?v:k}</option>)}</select></label>
    </fieldset>
    <button class="btn btn-small" disabled={!enabled} onClick={()=>{if(active)finish();else {pending.current={start:performance.now(),events:[]};setActive(true)}}}>{active?(zh?'结束本轮':'Finish trial'):(zh?'开始一轮':'Start trial')}</button>
    {rows.length>0 && <button class="btn btn-small" onClick={download}>{zh?'导出本机记录':'Export local results'} ({rows.length})</button>}
  </details>
}
