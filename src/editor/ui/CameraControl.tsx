import { useEffect, useRef, useState } from 'preact/hooks'
import { cameraSupported, CameraSession, type CamHint, type CamState } from '../../perception/camera.ts'
import { ContextRouter, type Action, type Mode } from '../../perception/router.ts'
import type { Hand, PerceptionEvent } from '../../perception/types.ts'
import { ta } from '../i18nAtelier.ts'
import { newClientId } from '../people.ts'
import { Icon } from './icons.tsx'

/**
 * The only door to the camera. Off until pressed. While on it always shows a "Camera on" light, a mirrored preview
 * and a Stop button. Video never leaves the page: only simple gesture events do, and the router decides what they may do.
 */
export function CameraControl(props: { mode: Mode; onAction: (a: Action) => void; hint: string }) {
  const [state, setState] = useState<CamState>('off')
  const [msg, setMsg] = useState('')
  const [hint, setHint] = useState<CamHint>('ok')
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
    window.addEventListener('pagehide', stop)
    return () => {
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
    setMsg('')
    const s = new CameraSession(
      video.current,
      {
        onEvent: (e: PerceptionEvent) => {
          if (['wave', 'heart', 'open_palm', 'thumbs_up'].includes(e.eventType)) setSeen(ta(`cam.g.${e.eventType}`))
          emit(router.current.route(e))
        },
        onState: (st, message) => {
          setState(st)
          if (message) setMsg(message)
          if (st === 'off' || st === 'error') {
            setPen(false)
            paint([])
            emit(router.current.setMode(router.current.mode))
          }
        },
        onHint: setHint,
        onFrame: paint,
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
          <button type="button" class="btn btn-small" onClick={() => void start()}>
            <Icon name="eye" size={16} /> {ta('cam.use')}
          </button>
        )}
        {state === 'on' && <span class="cam-live" role="status"><i aria-hidden="true" /> {ta('cam.on')}{props.mode === 'draw' ? ` · ${pen ? ta('cam.penDown') : ta('cam.penUp')}` : ''}</span>}
      </div>
      {state === 'off' && !msg && <p class="muted small">{ta('cam.privacy')}</p>}
      {state === 'asking' && <p class="muted small" role="status">{ta('cam.asking')}</p>}
      {state === 'loading' && <p class="muted small" role="status">{ta('cam.loading')}</p>}
      {state === 'error' && <p class="error small" role="alert">{msg}</p>}
      {state === 'on' && (
        <>
          <p class="muted small">{props.hint}</p>
          {hint === 'dark' && <p class="small" role="status">{ta('cam.dark')}</p>}
          {hint === 'no-hand' && <p class="small" role="status">{ta('cam.nohand')}</p>}
          {seen && <p class="muted small" role="status">{ta('cam.seen', { what: seen })}</p>}
        </>
      )}
      <div class="cam-preview" hidden={state !== 'on'}>
        <video ref={video} muted playsInline aria-hidden="true" />
        <canvas ref={overlay} width={160} height={120} aria-hidden="true" />
      </div>
    </div>
  )
}
