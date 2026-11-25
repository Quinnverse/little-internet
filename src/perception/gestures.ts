import { LM, type Hand, type Pt } from './types.ts'

/** Pure geometry on one frame. Every threshold is relative to hand size, so distance from the camera does not matter. */

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

const P = (h: Hand, i: number): Pt => h.points[i] ?? { x: 0, y: 0 }

/** Wrist to middle-finger knuckle. */
export const handSize = (h: Hand) => Math.max(1e-4, dist(P(h, LM.wrist), P(h, LM.middleMcp)))

/** A finger counts as extended when its tip is clearly farther from the wrist than its middle joint. */
function fingerExtended(h: Hand, pip: number, tip: number): boolean {
  const w = P(h, LM.wrist)
  return dist(P(h, tip), w) > dist(P(h, pip), w) * 1.2
}
export const indexUp = (h: Hand) => fingerExtended(h, LM.indexPip, 8)
export const middleUp = (h: Hand) => fingerExtended(h, LM.middlePip, LM.middleTip)
export const ringUp = (h: Hand) => fingerExtended(h, LM.ringPip, LM.ringTip)
export const pinkyUp = (h: Hand) => fingerExtended(h, LM.pinkyPip, LM.pinkyTip)

export function thumbOut(h: Hand): boolean {
  const s = handSize(h)
  const tip = P(h, LM.thumbTip)
  return dist(tip, P(h, LM.wrist)) > 1.1 * s && dist(tip, P(h, LM.indexMcp)) > 0.5 * s
}

export const fingersUp = (h: Hand) => [indexUp(h), middleUp(h), ringUp(h), pinkyUp(h)]

export const isOpenPalm = (h: Hand) => fingersUp(h).every(Boolean) && thumbOut(h)
export const isPointing = (h: Hand) => indexUp(h) && !middleUp(h) && !ringUp(h) && !pinkyUp(h)

export function isThumbsUp(h: Hand): boolean {
  if (fingersUp(h).some(Boolean) || !thumbOut(h)) return false
  const s = handSize(h)
  const tip = P(h, LM.thumbTip)
  // The thumb is the highest point of the hand and clearly above the knuckles.
  return tip.y < P(h, LM.indexMcp).y - 0.3 * s && h.points.every((p) => p.y >= tip.y - 1e-6)
}

/** Thumb tip to index tip, divided by hand size. Small means pinching. */
export const pinchRatio = (h: Hand) => dist(P(h, LM.thumbTip), P(h, 8)) / handSize(h)

/** Midpoint between thumb tip and index tip: where a pen would touch. */
export const pinchPoint = (h: Hand): Pt => ({ x: (P(h, LM.thumbTip).x + P(h, 8).x) / 2, y: (P(h, LM.thumbTip).y + P(h, 8).y) / 2 })

/**
 * Two-hand heart, a geometric rule: both index tips meet at the top, both thumb tips meet below them,
 * and the hands flank the shape (wrists apart). Needs both hands tracked with enough confidence.
 */
export function isHeart(a: Hand, b: Hand): boolean {
  const s = (handSize(a) + handSize(b)) / 2
  const thumbs = dist(P(a, LM.thumbTip), P(b, LM.thumbTip))
  const indexes = dist(P(a, 8), P(b, 8))
  if (thumbs > 0.7 * s || indexes > 0.9 * s) return false
  const topY = (P(a, 8).y + P(b, 8).y) / 2
  const bottomY = (P(a, LM.thumbTip).y + P(b, LM.thumbTip).y) / 2
  if (bottomY - topY < 0.5 * s) return false
  return dist(P(a, LM.wrist), P(b, LM.wrist)) > 1.0 * s
}

export const palmCenter = (h: Hand): Pt => {
  const ids: number[] = [LM.wrist, LM.indexMcp, LM.middleMcp, LM.ringMcp, LM.pinkyMcp]
  return { x: ids.reduce((n, i) => n + P(h, i).x, 0) / ids.length, y: ids.reduce((n, i) => n + P(h, i).y, 0) / ids.length }
}
