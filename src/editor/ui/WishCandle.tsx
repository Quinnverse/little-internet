import {useEffect,useRef,useState} from 'preact/hooks'

/** A short local listening window. The first half second sets the room noise floor. */
export function WishCandle({zh,onBlow}:{zh:boolean;onBlow:()=>void}){
 const [state,status]=useState('off')
 const version=useRef(0),stream=useRef<MediaStream|null>(null),context=useRef<AudioContext|null>(null),frame=useRef(0)
 const stop=()=>{version.current++;cancelAnimationFrame(frame.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null
   if(context.current)void context.current.close().catch(()=>{});context.current=null}
 const blow=()=>{stop();onBlow()}
 useEffect(()=>{const hidden=()=>{if(document.hidden){stop();status('off')}};document.addEventListener('visibilitychange',hidden);return()=>{stop();document.removeEventListener('visibilitychange',hidden)}},[])
 async function listen(){
  stop();const token=version.current;status('asking')
  try{
   const input=await navigator.mediaDevices.getUserMedia({audio:true})
   if(token!==version.current){input.getTracks().forEach(t=>t.stop());return}
   stream.current=input;const ac=new AudioContext();context.current=ac;await ac.resume();if(token!==version.current)return
   const meter=ac.createAnalyser();meter.fftSize=512;ac.createMediaStreamSource(input).connect(meter)
   const samples=new Float32Array(512),start=performance.now();let sum=0,n=0,loud=0
   status('quiet')
   const tick=(t:number)=>{if(token!==version.current)return;meter.getFloatTimeDomainData(samples)
    const rms=Math.sqrt(samples.reduce((s,v)=>s+v*v,0)/samples.length)
    if(t-start<600){sum+=rms;n++}else{status('listen');if(rms>Math.max(.055,3*sum/Math.max(n,1))){loud||=t;if(t-loud>200){blow();return}}else loud=0}
    if(t-start>8500){stop();status('off');return}frame.current=requestAnimationFrame(tick)}
   frame.current=requestAnimationFrame(tick)
  }catch{if(token===version.current){stop();status('error')}}
 }
 return <div class="candle-wish"><button onClick={blow}>🕯 {zh?'点一下吹灭':'Blow out candle'}</button>
 {['off','error'].includes(state)?<button onClick={listen}>{zh?'用麦克风吹气':'Use microphone'}</button>:<button onClick={()=>{stop();status('off')}}>{state==='listen'?(zh?'轻轻吹气':'Blow gently'):(zh?'请安静片刻':'A moment of quiet')} · ■</button>}
 {state==='error'&&<small>{zh?'麦克风不可用，仍可点蜡烛。':'Mic unavailable. Tap the candle.'}</small>}</div>
}
