import { handSize, isHeart, isOpenPalm, isPointing, isThumbsUp, palmCenter, pinchPoint, pinchRatio } from './gestures.ts'
import type { Frame, GestureKind, Hand, PerceptionEvent, PerceptionEventType } from './types.ts'

export type RecognizerConfig = {
  /** Hands the tracker is less sure about than this are ignored. */
  minScore: number
  /** A pose must be held this long before it counts (frame-rate independent). */
  holdMs: number
  /** A pose must be gone this long before it can count again. */
  releaseMs: number
  /** After a gesture fires, the same gesture is ignored this long. */
  cooldownMs: number
  /** Hands missing this long = hand lost (a pen that is down is lifted). */
  handLossMs: number
  pinchOn: number
  pinchOff: number
  pinchHoldMs: number
  waveWindowMs: number
  waveReversals: number
  waveSwing: number
  /** Selfie view: moving your hand to your right moves the pointer right. */
  mirror: boolean
}

export const DEFAULTS: RecognizerConfig = {
  minScore: 0.6,
  holdMs: 300,
  releaseMs: 250,
  cooldownMs: 1800,
  handLossMs: 400,
  pinchOn: 0.3,
  pinchOff: 0.5,
  pinchHoldMs: 60,
  waveWindowMs: 1200,
  waveReversals: 3,
  waveSwing: 0.35,
  mirror: true,
}

type Hold = { since: number; lastSeen: number; latched: boolean }

/**
 * Turns tracked hands into a few meaningful events. Pure and deterministic given the frames and their clock, so it is
 * tested with synthetic landmark streams. It never looks at pixels, faces or identities.
 */
export class GestureRecognizer {
  readonly sessionId: string
  private cfg: RecognizerConfig
  private n = 0
  private present = false
  private lastHandT = 0
  private drawingHand:Hand['handedness']|null=null
  private rearm=false
  private pen = false
  private pinchSince: number | null = null
  private releaseSince: number | null = null
  private lastPoint = { x: 0.5, y: 0.5 }
  private holds = new Map<GestureKind, Hold>()
  private fired = new Map<GestureKind, number>()
  private trail: { t: number; x: number }[] = []

  constructor(sessionId: string, cfg: Partial<RecognizerConfig> = {}) {
    this.sessionId = sessionId
    this.cfg = { ...DEFAULTS, ...cfg }
  }

  reset() {
    this.present = false
    this.pen = false
    this.pinchSince = this.releaseSince = null
    this.holds.clear()
    this.trail = []
  }

  get penDown() {
    return this.pen
  }

  private ev(type: PerceptionEventType, t: number, confidence: number, pos?: { x: number; y: number }): PerceptionEvent {
    const e: PerceptionEvent = { eventId: `${this.sessionId}-${++this.n}`, eventType: type, timestamp: t, source: 'camera-hand', confidence: Math.round(confidence * 100) / 100, interactionSessionId: this.sessionId }
    if (pos) {
      e.x = this.cfg.mirror ? 1 - pos.x : pos.x
      e.y = pos.y
    }
    return e
  }

  feed(frame: Frame): PerceptionEvent[] {
    const c = this.cfg
    const t = frame.t
    const out: PerceptionEvent[] = []
    const hands = frame.hands.filter((h) => h.score >= c.minScore && h.points.length === 21).sort((a, b) => b.score - a.score)

    const priorHand=this.drawingHand
    const active=hands.find(h=>h.handedness===priorHand)
    const outside=active?.points[8] && (active.points[8].x<=0 || active.points[8].x>=1 || active.points[8].y<=0 || active.points[8].y>=1)
    if(priorHand && (!active || outside)){
      if(this.pen)out.push(this.ev('pinch_end',t,1,this.lastPoint))
      this.pen=false
      this.pinchSince=this.releaseSince=null
      this.rearm=true
      this.drawingHand=null
    }
    if (hands.length === 0) {
      if (this.present && t - this.lastHandT >= c.handLossMs) {
        if (this.pen) {
          out.push(this.ev('pinch_end', t, 1, this.lastPoint))
          this.pen = false
        }
        out.push(this.ev('hand_lost', t, 1))
        this.reset()
      }
      return out
    }

    this.lastHandT = t
    if (!this.present) {
      this.present = true
      out.push(this.ev('hand_found', t, hands[0]!.score))
    }
    const main = active ?? hands[0]!

    // ---- pen: pinch with hysteresis and a short hold, so one noisy frame never draws or lifts
    const ratio = pinchRatio(main)
    if (!this.pen) {
      if(ratio>=c.pinchOff)this.rearm=false
      if (ratio < c.pinchOn && !this.rearm) {
        this.drawingHand=main.handedness
        this.pinchSince ??= t
        if (t - this.pinchSince >= c.pinchHoldMs) {
          this.pen = true
          this.pinchSince = null
          this.lastPoint = pinchPoint(main)
          out.push(this.ev('pinch_start', t, main.score, this.lastPoint))
        }
      } else this.pinchSince = null
    } else if (ratio > c.pinchOff) {
      this.releaseSince ??= t
      if (t - this.releaseSince >= c.pinchHoldMs) {
        this.pen = false
        this.releaseSince = null
        this.drawingHand=null
        out.push(this.ev('pinch_end', t, main.score, this.lastPoint))
      }
    } else this.releaseSince = null

    if (this.pen || ratio < c.pinchOn) {
      this.lastPoint = pinchPoint(main)
      out.push(this.ev('pointer_move', t, main.score, this.lastPoint))
    } else if (isPointing(main)) {
      this.lastPoint = main.points[8]!
      out.push(this.ev('pointer_move', t, main.score, this.lastPoint))
    }

    // ---- discrete gestures are ignored while the pen is down
    if (this.pen) {
      this.holds.clear()
      this.trail = []
      return out
    }
    out.push(...this.gestures(hands, t))
    return out
  }

  private gestures(hands: Hand[], t: number): PerceptionEvent[] {
    const c = this.cfg
    const out: PerceptionEvent[] = []
    const seen = new Map<GestureKind, number>() // kind -> confidence
    const heart = hands.length >= 2 && isHeart(hands[0]!, hands[1]!)
    if (heart) seen.set('heart', Math.min(hands[0]!.score, hands[1]!.score))

    const palm = heart ? undefined : hands.find((h) => isOpenPalm(h))
    if (palm) {
      const size = handSize(palm)
      this.trail.push({ t, x: palmCenter(palm).x })
      this.trail = this.trail.filter((p) => t - p.t <= c.waveWindowMs)
      const recent = this.trail.filter((p) => t - p.t <= c.holdMs).map((p) => p.x)
      const still = recent.length > 0 && Math.max(...recent) - Math.min(...recent) < 0.6 * size
      if (this.reversals(size) >= c.waveReversals) {
        if (t - (this.fired.get('wave') ?? -Infinity) >= c.cooldownMs) {
          this.fired.set('wave', t)
          out.push(this.ev('wave', t, palm.score))
        }
        this.trail = []
        this.holds.delete('open_palm')
      } else if (still) seen.set('open_palm', palm.score)
    } else this.trail = []

    const up = heart ? undefined : hands.find((h) => isThumbsUp(h))
    if (up) seen.set('thumbs_up', up.score)

    for (const [kind, conf] of seen) {
      const h = this.holds.get(kind)
      if (!h) this.holds.set(kind, { since: t, lastSeen: t, latched: false })
      else {
        h.lastSeen = t
        if (!h.latched && t - h.since >= c.holdMs && t - (this.fired.get(kind) ?? -Infinity) >= c.cooldownMs) {
          h.latched = true
          this.fired.set(kind, t)
          out.push(this.ev(kind, t, conf))
        }
      }
    }
    for (const [kind, h] of this.holds) if (!seen.has(kind) && t - h.lastSeen > c.releaseMs) this.holds.delete(kind)
    return out
  }

  /** Number of direction changes of the palm, each swing at least `waveSwing` hand sizes wide. */
  private reversals(size: number): number {
    const min = this.cfg.waveSwing * size
    let dir = 0
    let extreme = this.trail[0]?.x ?? 0
    let count = 0
    for (const { x } of this.trail) {
      if (dir === 0) {
        if (x - extreme >= min) (dir = 1), (extreme = x)
        else if (extreme - x >= min) (dir = -1), (extreme = x)
      } else if (dir === 1) {
        if (x > extreme) extreme = x
        else if (extreme - x >= min) (count++, (dir = -1), (extreme = x))
      } else if (x < extreme) extreme = x
      else if (x - extreme >= min) (count++, (dir = 1), (extreme = x))
    }
    return count
  }
}

