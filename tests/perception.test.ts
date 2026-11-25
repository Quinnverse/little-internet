import { describe, expect, it } from 'vitest'
import { isHeart, isOpenPalm, isPointing, isThumbsUp, pinchRatio } from '../src/perception/gestures.ts'
import { GestureRecognizer } from '../src/perception/recognizer.ts'
import { ContextRouter } from '../src/perception/router.ts'
import type { PerceptionEvent } from '../src/perception/types.ts'
import { hand, heartHands, stream } from './perception-fixtures.ts'

const run = (rec: GestureRecognizer, frames: ReturnType<typeof stream>) => frames.flatMap((f) => rec.feed(f))
const kinds = (ev: PerceptionEvent[]) => ev.map((e) => e.eventType)

describe('hand pose rules (synthetic landmarks)', () => {
  it('H1: poses are recognised and mutually exclusive', () => {
    expect(isOpenPalm(hand({ pose: 'open' }))).toBe(true)
    expect(isOpenPalm(hand({ pose: 'fist' }))).toBe(false)
    expect(isPointing(hand({ pose: 'point' }))).toBe(true)
    expect(isPointing(hand({ pose: 'open' }))).toBe(false)
    expect(isThumbsUp(hand({ pose: 'thumbsUp' }))).toBe(true)
    expect(isThumbsUp(hand({ pose: 'fist' }))).toBe(false)
    expect(isThumbsUp(hand({ pose: 'open' }))).toBe(false)
    expect(pinchRatio(hand({ pose: 'pinch' }))).toBeLessThan(0.3)
    expect(pinchRatio(hand({ pose: 'open' }))).toBeGreaterThan(0.6)
  })

  it('H2: poses do not depend on how far the hand is from the camera', () => {
    for (const size of [0.06, 0.15, 0.35]) {
      expect(isOpenPalm(hand({ pose: 'open', size }))).toBe(true)
      expect(isThumbsUp(hand({ pose: 'thumbsUp', size }))).toBe(true)
      expect(pinchRatio(hand({ pose: 'pinch', size }))).toBeLessThan(0.3)
    }
  })

  it('H3: the two-hand heart needs both pairs of tips to meet, thumbs below index tips, hands apart', () => {
    const [l, r] = heartHands()
    expect(isHeart(l!, r!)).toBe(true)
    const move = (h: typeof l, i: number, x: number, y: number) => ({ ...h!, points: h!.points.map((p, k) => (k === i ? { ...p, x, y } : p)) })
    expect(isHeart(move(l, 8, 0.3, 0.5), r!)).toBe(false) // index tips apart
    expect(isHeart(move(l, 4, 0.3, 0.66), r!)).toBe(false) // thumb tips apart
    expect(isHeart(move(l, 4, 0.5, 0.5), move(r, 4, 0.5, 0.5))).toBe(false) // thumbs level with index tips (clap)
    expect(isHeart(hand({ pose: 'open', cx: 0.4 }), hand({ pose: 'open', cx: 0.6 }))).toBe(false) // two open palms
    const pressed = (h: typeof l, x: number) => ({ ...h!, points: h!.points.map((p, k) => (k === 0 ? { ...p, x, y: 0.78 } : p)) })
    expect(isHeart(pressed(l, 0.49), pressed(r, 0.51))).toBe(false) // wrists together: not a heart shape
  })
})

describe('gesture recognizer on synthetic streams', () => {
  it('R1: a held heart fires once with an event id, session and confidence; holding longer does not repeat', () => {
    const rec = new GestureRecognizer('s1')
    const ev = run(rec, stream(1500, () => heartHands(0.9)))
    const hearts = ev.filter((e) => e.eventType === 'heart')
    expect(hearts).toHaveLength(1)
    expect(hearts[0]).toMatchObject({ source: 'camera-hand', interactionSessionId: 's1', confidence: 0.9 })
    expect(hearts[0]!.eventId).toMatch(/^s1-\d+$/)
    expect(hearts[0]!.timestamp).toBeGreaterThanOrEqual(300)
  })

  it('R2: a heart flashed for a moment (under the hold time) does nothing', () => {
    const rec = new GestureRecognizer('s')
    const ev = run(rec, stream(1200, (t) => (t > 400 && t < 560 ? heartHands() : [hand({ pose: 'fist', cx: 0.3 })])))
    expect(kinds(ev)).not.toContain('heart')
  })

  it('R3: low-confidence hands are ignored', () => {
    const rec = new GestureRecognizer('s')
    expect(run(rec, stream(1500, () => heartHands(0.4)))).toEqual([])
  })

  it('R4: a still open palm is open_palm; waving it is a wave and not an open_palm', () => {
    const still = run(new GestureRecognizer('s'), stream(1200, () => [hand({ pose: 'open' })]))
    expect(kinds(still).filter((k) => k !== 'hand_found')).toEqual(['open_palm'])
    const waving = run(new GestureRecognizer('s'), stream(2000, (t) => [hand({ pose: 'open', cx: 0.5 + 0.12 * Math.sin((t / 1000) * 2 * Math.PI * 2) })]))
    const k = kinds(waving)
    expect(k.filter((x) => x === 'wave')).toHaveLength(1)
    expect(k).not.toContain('open_palm')
  })

  it('R5: slow drifting or small jitter is not a wave', () => {
    const drift = run(new GestureRecognizer('s'), stream(3000, (t) => [hand({ pose: 'open', cx: 0.3 + t / 10000 })]))
    expect(kinds(drift)).not.toContain('wave')
    const jitter = run(new GestureRecognizer('s'), stream(3000, (t) => [hand({ pose: 'open', cx: 0.5 + 0.004 * Math.sin(t / 30) })]))
    expect(kinds(jitter)).not.toContain('wave')
  })

  it('R6: cooldown: the same gesture is not repeated until the cooldown has passed and the pose was released', () => {
    const rec = new GestureRecognizer('s', { cooldownMs: 2000 })
    const frames = [...stream(800, () => [hand({ pose: 'thumbsUp' })]), ...stream(600, () => [hand({ pose: 'fist' })], 800), ...stream(800, () => [hand({ pose: 'thumbsUp' })], 1400), ...stream(600, () => [hand({ pose: 'fist' })], 2200), ...stream(900, () => [hand({ pose: 'thumbsUp' })], 2800)]
    const ups = run(rec, frames).filter((e) => e.eventType === 'thumbs_up')
    expect(ups).toHaveLength(2)
    expect(ups[1]!.timestamp - ups[0]!.timestamp).toBeGreaterThanOrEqual(2000)
  })

  it('R7: pinch is a pen with hysteresis: starts after a short hold, ends only on a clear release, points are mirrored', () => {
    const rec = new GestureRecognizer('s')
    const ev = run(rec, [
      ...stream(300, () => [hand({ pose: 'point' })]),
      ...stream(500, () => [hand({ pose: 'pinch' })], 300),
      ...stream(300, () => [hand({ pose: 'open' })], 800),
    ])
    const k = kinds(ev)
    expect(k.filter((x) => x === 'pinch_start')).toHaveLength(1)
    expect(k.filter((x) => x === 'pinch_end')).toHaveLength(1)
    expect(k.indexOf('pinch_start')).toBeLessThan(k.indexOf('pinch_end'))
    const start = ev.find((e) => e.eventType === 'pinch_start')!
    expect(start.x!).toBeGreaterThan(0.5) // hand drawn on the left of the image -> right half in the mirrored view
    const unmirrored = run(new GestureRecognizer('s', { mirror: false }), stream(500, () => [hand({ pose: 'pinch' })])).find((e) => e.eventType === 'pinch_start')!
    expect(unmirrored.x!).toBeCloseTo(1 - start.x!, 5)
  })

  it('R8: one noisy frame cannot start or lift the pen', () => {
    const rec = new GestureRecognizer('s')
    const ev = run(rec, stream(1000, (_t, i) => [hand({ pose: i % 15 === 7 ? 'open' : 'pinch' })]))
    // the pinch is stable except for one open frame every half second: pen starts once, never lifts
    expect(kinds(ev).filter((k) => k === 'pinch_end')).toHaveLength(0)
    expect(kinds(ev).filter((k) => k === 'pinch_start')).toHaveLength(1)
  })

  it('R9: losing the hand lifts the pen and reports hand_lost; discrete gestures are ignored while drawing', () => {
    const rec = new GestureRecognizer('s')
    const ev = run(rec, [...stream(500, () => [hand({ pose: 'pinch' })]), ...stream(700, () => [], 500)])
    const k = kinds(ev)
    expect(k).toContain('pinch_end')
    expect(k.at(-1)).toBe('hand_lost')
    expect(rec.penDown).toBe(false)
  })

  it('R10: brief hand dropouts (under the loss time) do not end the session', () => {
    const rec = new GestureRecognizer('s')
    const ev = run(rec, stream(1500, (t) => (t > 600 && t < 800 ? [] : [hand({ pose: 'thumbsUp' })])))
    expect(kinds(ev)).not.toContain('hand_lost')
    expect(kinds(ev).filter((k) => k === 'thumbs_up')).toHaveLength(1)
  })
})

describe('context router: what a gesture may do', () => {
  const e = (eventType: PerceptionEvent['eventType'], extra: Partial<PerceptionEvent> = {}): PerceptionEvent => ({ eventId: 'e1', eventType, timestamp: 0, source: 'camera-hand', confidence: 0.9, interactionSessionId: 's', ...extra })

  it('C1: at home a heart makes Boo catch it and never proposes or sends a gift', () => {
    const r = new ContextRouter()
    r.setMode('boo')
    const a = r.route(e('heart'))
    expect(a).toEqual([{ kind: 'boo', reaction: 'catch-heart', eventId: 'e1' }])
    expect(a.some((x) => x.kind === 'propose-gift')).toBe(false)
  })

  it('C2: only send mode turns a heart into a proposal, and the other gestures stay inert there', () => {
    const r = new ContextRouter()
    r.setMode('send')
    expect(r.route(e('heart'))).toEqual([{ kind: 'propose-gift', gift: 'heart', eventId: 'e1' }])
    expect(r.route(e('wave'))).toEqual([])
    expect(r.route(e('thumbs_up'))).toEqual([])
  })

  it('C3: in idle mode nothing but the cursor moves', () => {
    const r = new ContextRouter()
    for (const t of ['wave', 'heart', 'open_palm', 'thumbs_up', 'pinch_start'] as const) expect(r.route(e(t))).toEqual([])
    expect(r.route(e('pointer_move', { x: 0.2, y: 0.3 }))).toEqual([{ kind: 'cursor', x: 0.2, y: 0.3 }])
  })

  it('C4: drawing: pinch begins, points follow, release ends; gestures never act; leaving draw mode lifts the pen', () => {
    const r = new ContextRouter()
    r.setMode('draw')
    expect(r.route(e('pointer_move', { x: 0.1, y: 0.1 }))).toEqual([{ kind: 'cursor', x: 0.1, y: 0.1 }])
    expect(r.route(e('pinch_start', { x: 0.2, y: 0.2 }))).toMatchObject([{ kind: 'draw', op: 'begin', x: 0.2, y: 0.2 }])
    expect(r.route(e('pointer_move', { x: 0.3, y: 0.25 }))).toMatchObject([{ kind: 'draw', op: 'point', x: 0.3, y: 0.25 }])
    expect(r.route(e('heart'))).toEqual([])
    expect(r.setMode('boo')).toMatchObject([{ kind: 'draw', op: 'end' }])
    const r2 = new ContextRouter()
    r2.setMode('draw')
    r2.route(e('pinch_start', { x: 0.5, y: 0.5 }))
    expect(r2.route(e('hand_lost'))).toMatchObject([{ kind: 'draw', op: 'end' }])
  })

  it('C5: events below the confidence floor are dropped', () => {
    const r = new ContextRouter()
    r.setMode('boo')
    expect(r.route(e('wave', { confidence: 0.3 }))).toEqual([])
  })
})
