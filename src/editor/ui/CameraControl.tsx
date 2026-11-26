import { useEffect, useRef, useState } from 'preact/hooks'
import { cameraSupported, CameraSession, type CamHint, type CamState } from '../../perception/camera.ts'
import { ContextRouter, type Action, type Mode } from '../../perception/router.ts'
import type { Hand, PerceptionEvent } from '../../perception/types.ts'
import { getLang } from '../i18n.ts'
import { ta } from '../i18nAtelier.ts'
import { newClientId } from '../people.ts'
import { GestureTrials, type TrialSink } from './GestureTrials.tsx'
import { Icon } from './icons.tsx'

/**
 * The only door to the camera. Off until pressed. While on it always shows a "Camera on" light, a mirrored preview
 * and a Stop button. Video never leaves the page: only simple gesture events do, and the router decides what they may do.
 */
export function CameraControl(props: { mode: Mode; onAction: (a: Action) => void; hint: string; immersive?:boolean; softwareRenderer?:boolean; onFace?:(cue:import('../../perception/face.ts').FaceCue)=>void }) {
  const [state, setState] = useState<CamState>('off')
  const [msg, setMsg] = useState('')
  const [hint, setHint] = useState<CamHint>('ok')
  const zh = getLang() === 'zh'
  const [preview,setPreview] = useState(true)
  const [count,setCount] = useState<number | null>(null)
  const [facePresent,setFacePresent] = useState(false)
  const trials:TrialSink = useRef(null)
  const lastAction = useRef(0)
  const lastSeen = useRef(0)
  const [debug,setDebug]=useState(false)
  const [hands,setHands] = useState(true)
  const [face,setFace]=useState(false)
  const [seen, setSeen] = useState('')
  const [pen, setPen] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const session = useRef<CameraSession | null>(null)
  const router = useRef(new ContextRouter())
  const onAction = useRef(props.onAction)
  onAction.current = props.onAction

  const emit = (actions: Action[]) => {
    for (const a of actions) {
      if (a.kind === 'draw') setPen(a.op !== 'end')
      onAction.current(a)
    }
  }
  useEffect(() => emit(router.current.setMode(props.mode)), [props.mode])
  useEffect(() => {
    const stop = () => session.current?.stop()
    const background = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', background)
    window.addEventListener('pagehide', stop)
    return () => {
      document.removeEventListener('visibilitychange', background)
      window.removeEventListener('pagehide', stop)
      session.current?.stop()
    }
  }, [])

  const paint = (hands: readonly Hand[]) => {
    const c = overlay.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = '#ffd36e'
    for (const h of hands) for (const p of h.points) g.fillRect((1 - p.x) * c.width - 1.5, p.y * c.height - 1.5, 3, 3)
  }

  const start = async () => {
    if (!video.current) return
    session.current?.stop()
    setHint('ok')
    setMsg('')
    setSeen('')
    setCount(null)
    setFacePresent(false)
    setPreview(true)
    const s = new CameraSession(
      video.current,
      {
        onEvent: (e: PerceptionEvent) => {
          trials.current?.(e.eventType)
          if (['wave', 'heart', 'open_palm', 'thumbs_up'].includes(e.eventType)) {
            lastAction.current = performance.now()
            lastSeen.current = performance.now()
            setSeen(ta(`cam.g.${e.eventType}`))
          } else if (e.eventType === 'pointer_move' && performance.now()-lastAction.current>1800) {
            lastSeen.current = performance.now()
            setSeen(zh?'食指移动':'Pointing')
          }
          emit(router.current.route(e))
        },
        onState: (st, message) => {
          setState(st)
          if (message) setMsg(message)
          if (st === 'off' || st === 'error') {
            setPen(false)
            paint([])
            emit(router.current.setMode('idle'))
            router.current.setMode(props.mode)
          }
        },
        onHint: setHint,
        hands,
        preferCPU: !!props.softwareRenderer,
        ...(face && props.onFace ? {onFace:(cue:import('../../perception/face.ts').FaceCue)=>{
          trials.current?.(cue)
          lastAction.current=performance.now()
          lastSeen.current=performance.now()
          setSeen(zh?{smile:'微笑',blink:'眨眼',left:'向左转头',right:'向右转头'}[cue]:cue)
          props.onFace?.(cue)
        }} : {}),
        onFrame:(detected,present)=>{
          setCount(detected.length)
          setFacePresent(present)
          if ((!detected.length && !present) || performance.now()-lastSeen.current>1800) setSeen('')
          if (debug) paint(detected)
        },
      },
      newClientId(),
    )
    session.current = s
    await s.start()
  }
  const stop = () => session.current?.stop()
  const live = state === 'on' || state === 'loading' || state === 'asking'

  if (!cameraSupported()) return <p class="muted small">{ta('cam.unsupported')}</p>
  return (
    <div class="camera-control">
      <div class="choice-row">
        {live ? (
          <button type="button" class="btn btn-small" onClick={stop}>
            <Icon name="stop" size={16} /> {ta('cam.stop')}
          </button>
        ) : (
          <button type="button" class="btn btn-small" disabled={!hands && !face} onClick={() => void start()}>
            <Icon name="eye" size={16} /> {ta('cam.use')}
          </button>
        )}
        {(state === 'on' || state === 'loading') && <span class="cam-live" role="status"><i aria-hidden="true" /> {ta('cam.on')}{props.mode === 'draw' ? ` · ${pen ? ta('cam.penDown') : ta('cam.penUp')}` : ''}</span>}
      </div>
      {state === 'off' && !msg && <p class="muted small">{ta('cam.privacy')}</p>}
      {state === 'asking' && <p class="muted small" role="status">{ta('cam.asking')}</p>}
      {state === 'loading' && <p class="muted small" role="status">{ta('cam.loading')}</p>}
      {state === 'error' && <p class="error small" role="alert">{msg}</p>}
      {live && state !== 'asking' && <button class="btn btn-small" aria-expanded={preview} onClick={()=>setPreview(!preview)}>
        {preview ? (zh?'收起画面':'Hide preview') : (zh?'显示画面':'Show preview')}
      </button>}
      {props.immersive&&!live&&<details><summary>Perception options · 感知设置</summary>
        <label><input type="checkbox" checked={hands} onChange={e=>setHands(e.currentTarget.checked)}/> Hand gestures · 手势</label>
        <label><input type="checkbox" checked={face} onChange={e=>setFace(e.currentTarget.checked)}/> Face movements · 面部动作</label>
        <label><input type="checkbox" checked={debug} onChange={e=>setDebug(e.currentTarget.checked)}/> Debug preview · 调试预览</label></details>}
      <div class="cam-preview" hidden={!preview || (state !== 'loading' && state !== 'on')}>
        <video ref={video} muted playsInline autoPlay aria-label={zh?'本机摄像头镜像画面':'Mirrored local camera preview'} />
        {debug && <canvas ref={overlay} width={160} height={120} aria-hidden="true" />}
      </div>
      {state === 'on' && <div class="cam-feedback" role="status">
        {count === null ? (zh?'等待第一帧…':'Waiting for first frame…') : <>
          {hands && <span>{count ? (zh?`已检测到 ${count} 只手`:`${count} hand(s) tracked`) : (zh?'寻找手部，请让手腕也入镜':'Looking for hands. Include your wrists.')}</span>}
          {face && <span>{facePresent ? (zh?'已检测到面部':'Face tracked') : (zh?'寻找面部':'Looking for face')}</span>}
        </>}
        {seen && <strong>{ta('cam.seen',{what:seen})}</strong>}
        {hint==='dark' && <span>{ta('cam.dark')}</span>}
      </div>}
      <details class="cam-guide"><summary>{zh?'第一次使用？动作示范':'How to gesture'}</summary>
        {props.mode==='draw' ? (zh?'☝ 移动食指定位。捏合拇指与食指落笔，松开抬笔。':'Point to aim. Pinch thumb and index finger to draw; release to lift.') :
        (zh?'✋ 将手掌和手腕放在胸前，左右挥手。♡ 双手同时入镜，两食指在上、两拇指在下，相接并停半秒。':'Wave an open palm with your wrist in frame. For a heart, bring both index tips together above the touching thumbs and hold for half a second.')}
      </details>
      <GestureTrials sink={trials} zh={zh} enabled={state==='on'}/>
    </div>
  )
}
