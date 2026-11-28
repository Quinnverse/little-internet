import { GestureRecognizer } from './recognizer.ts'
import { createHandTracker, type HandTracker } from './tracker.ts'
import type { Hand, PerceptionEvent } from './types.ts'

export type CamState = 'off' | 'asking' | 'loading' | 'on' | 'error'
export type CamHint = 'ok' | 'dark' | 'no-hand'

export function describeCameraError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was refused. You can allow it in the browser settings, or keep drawing with the mouse or your finger.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found. Mouse, touch and pen work the same way.'
  if (name === 'NotReadableError') return 'The camera is busy in another app.'
  return e instanceof Error ? e.message : 'The camera is not available here.'
}

export const cameraSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof isSecureContext === 'undefined' || isSecureContext)

/**
 * One camera session. Off until `start()`. While on: tracks are live, frames are analysed in memory and dropped,
 * only small perception events go out. `stop()` releases the camera (the browser's recording light goes out).
 * The loop slows itself down when the device is slow and pauses while the tab is hidden.
 */
let activeCamera: CameraSession | null = null

export class CameraSession {
  private epoch=0
  private face: import('./face.ts').FaceTracker|null=null
  private firstFrame=true
  private firstAction=true
  private lastVideoTime = -1
  private lastFace=0
  private stream: MediaStream | null = null
  private tracker: HandTracker | null = null
  private timer = 0
  private running = false
  private ema = 20
  private lastDark = 0
  private canvas: HTMLCanvasElement | null = null
  private rec: GestureRecognizer
  private sawHandAt = 0
  private hint: CamHint = 'ok'
  private handsNow = 0
  private onVis = () => {
    if (document.hidden) window.clearTimeout(this.timer)
    else if (this.running) this.schedule(0)
  }

  readonly video: HTMLVideoElement
  private cb: {
    onEvent: (e: PerceptionEvent) => void
    onState: (s: CamState, message?: string) => void
    onHint?: (h: CamHint) => void
    preferCPU?: boolean
    mirror?:boolean
    onStage?:(s:string)=>void
    hands?: boolean
    onFace?: (cue:import('./face.ts').FaceCue)=>void
    onFrame?: (hands: readonly Hand[], facePresent:boolean) => void
  }

  constructor(video: HTMLVideoElement, cb: CameraSession['cb'], sessionId: string) {
    this.video = video
    this.cb = cb
    this.rec = new GestureRecognizer(sessionId,{mirror:cb.mirror??true})
  }

  get delegate() {
    return this.tracker?.delegate
  }

  async start(): Promise<void> {
    if (activeCamera === this) return
    activeCamera?.stop()
    activeCamera = this
    const epoch=++this.epoch
    for(const key of ['start','hand-resolver-start','hand-resolver-ready','hand-graph-ready','first-frame','first-action','feedback-frame'])performance.clearMarks('li-'+key)
    performance.mark('li-start')
    this.firstFrame=true;this.firstAction=true
    this.lastVideoTime = -1
    this.cb.onState('asking')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false })
      if(epoch!==this.epoch){stream.getTracks().forEach(t=>t.stop());return}
      this.stream=stream
    } catch (e) {
      if(epoch!==this.epoch)return
      activeCamera = null
      this.cb.onState('error', describeCameraError(e))
      return
    }
    this.cb.onState('loading')
    try {
      this.video.srcObject = this.stream
      this.video.muted = true
      this.video.playsInline = true
      await this.video.play()
      if(epoch!==this.epoch)return
      if (this.cb.hands !== false) {
        this.cb.onStage?.('Hand model · 手部模型')
        const tracker = await createHandTracker('VIDEO', this.cb.preferCPU)
        if (epoch !== this.epoch) { tracker.close(); return }
        this.tracker = tracker
      }
      if(this.cb.onFace){
        this.cb.onStage?.('Face model · 面部模型')
        const {createFaceTracker}=await import('./face.ts')
        if(epoch!==this.epoch)return
        const face=await createFaceTracker()
        if(epoch!==this.epoch){face.close();return}
        this.face=face
      }
    } catch (e) {
      if(epoch!==this.epoch)return
      this.stop()
      this.cb.onState('error', e instanceof Error ? `Hand tracking could not start: ${e.message}` : 'Hand tracking could not start.')
      return
    }
    this.running = true
    document.addEventListener('visibilitychange', this.onVis)
    this.cb.onState('on')
    this.schedule(0)
  }

  stop() {
    ++this.epoch
    if (activeCamera === this) activeCamera = null
    this.canvas = null
    this.running = false
    window.clearTimeout(this.timer)
    document.removeEventListener('visibilitychange', this.onVis)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video.pause()
    this.video.srcObject = null
    try { this.face?.close() } catch { /* continue releasing the hand tracker */ }
    this.face = null
    try {
      this.tracker?.close()
    } catch {
      /* already closed */
    }
    this.tracker = null
    this.rec.reset()
    this.cb.onState('off')
  }

  private schedule(ms: number) {
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.tick(), ms)
  }

  private tick() {
    if (!this.running) return
    if (document.hidden) return
    const t0 = performance.now()
    if (this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime
      let hands: Hand[] = []
      try {
        hands = this.tracker?.detect(this.video, t0) ?? []
      } catch {
        this.stop()
        this.cb.onState('error', 'Hand tracking interrupted. Restart the camera to retry.')
        return
      }
      if(this.face && t0-this.lastFace>=Math.max(48,this.ema*1.5)){
        this.lastFace=t0
        try{const cue=this.face.detect(this.video,t0);if(cue)this.cb.onFace?.(cue)}catch{this.stop();this.cb.onState('error','Face tracking interrupted. Start again to retry.');return}
      }
      if(this.firstFrame){performance.mark('li-first-frame');this.firstFrame=false}
      this.cb.onFrame?.(hands, this.face?.present ?? false)
      if (hands.length) this.sawHandAt = t0
      this.handsNow = hands.length
      for (const e of this.rec.feed({ t: t0, hands })) {
        this.cb.onEvent(e)
        if(this.firstAction && ['heart','wave','open_palm','thumbs_up'].includes(e.eventType)){
          this.firstAction=false
          performance.mark('li-first-action',{detail:{kind:e.eventType,inferenceStart:t0}})
          requestAnimationFrame(()=>performance.mark('li-feedback-frame'))
        }
      }
      this.checkHint(t0)
    }
    const cost = performance.now() - t0
    this.ema = this.ema * 0.8 + cost * 0.2
    // Run at most ~20 fps and back off on slow devices so the page stays responsive.
    this.schedule(Math.max(0, Math.min(200, Math.max(50, this.ema * 2) - cost)))
  }

  private checkHint(now: number) {
    let h: CamHint = this.hint
    if (now - this.lastDark > 1500) {
      this.lastDark = now
      this.canvas ??= Object.assign(document.createElement('canvas'), { width: 16, height: 12 })
      const g = this.canvas.getContext('2d', { willReadFrequently: true })
      if (g) {
        g.drawImage(this.video, 0, 0, 16, 12)
        const d = g.getImageData(0, 0, 16, 12).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!
        const luma = sum / (d.length / 4)
        h = luma < 45 ? 'dark' : this.handsNow === 0 && now - this.sawHandAt > 4000 ? 'no-hand' : 'ok'
      }
    }
    if (h !== this.hint) {
      this.hint = h
      this.cb.onHint?.(h)
    }
  }
}
