import { LM, type Frame, type Hand, type Pt } from '../src/perception/types.ts'

/** Synthetic hands in image space: upright, wrist at (cx, cy), size = wrist to middle knuckle. Not recorded from a camera. */
export type Pose = 'open' | 'fist' | 'point' | 'pinch' | 'thumbsUp'

const FINGERS = [
  { mcp: [-0.3, -0.95], dir: [-0.05, -1] }, // index
  { mcp: [0, -1], dir: [0, -1] }, // middle
  { mcp: [0.28, -0.95], dir: [0.05, -1] }, // ring
  { mcp: [0.52, -0.85], dir: [0.1, -1] }, // pinky
] as const

export function hand(opts: { cx?: number; cy?: number; size?: number; pose: Pose; score?: number; handedness?: 'Left' | 'Right'; override?: Record<number, [number, number]> }): Hand {
  const { cx = 0.5, cy = 0.75, size = 0.15, pose, score = 0.95, handedness = 'Right' } = opts
  const up = pose === 'open' ? [true, true, true, true] : pose === 'point' ? [true, false, false, false] : [false, false, false, false]
  const rel: [number, number][] = new Array(21)
  rel[0] = [0, 0]
  FINGERS.forEach((f, i) => {
    const base = 5 + i * 4
    const [mx, my] = f.mcp
    const [dx, dy] = f.dir
    rel[base] = [mx, my]
    if (up[i]) {
      rel[base + 1] = [mx + dx * 0.4, my + dy * 0.4]
      rel[base + 2] = [mx + dx * 0.7, my + dy * 0.7]
      rel[base + 3] = [mx + dx * 1.0, my + dy * 1.0]
    } else {
      rel[base + 1] = [mx, my - 0.35]
      rel[base + 2] = [mx, my - 0.15]
      rel[base + 3] = [mx, my + 0.05]
    }
  })
  const thumbs: Record<Pose, [number, number][]> = {
    open: [[-0.3, -0.2], [-0.6, -0.45], [-0.9, -0.65], [-1.15, -0.85]],
    point: [[-0.3, -0.2], [-0.35, -0.35], [-0.3, -0.5], [-0.2, -0.55]],
    fist: [[-0.3, -0.2], [-0.35, -0.35], [-0.3, -0.5], [-0.2, -0.55]],
    pinch: [[-0.3, -0.2], [-0.45, -0.5], [-0.5, -0.8], [-0.52, -1.0]],
    thumbsUp: [[-0.3, -0.2], [-0.45, -0.55], [-0.5, -1.0], [-0.5, -1.5]],
  }
  thumbs[pose].forEach((p, i) => (rel[1 + i] = p))
  if (pose === 'pinch') {
    rel[6] = [-0.3, -1.25]
    rel[7] = [-0.45, -1.15]
    rel[8] = [-0.5, -1.03]
  }
  for (const [i, p] of Object.entries(opts.override ?? {})) rel[Number(i)] = p
  const points: Pt[] = rel.map(([x, y]) => ({ x: cx + x * size, y: cy + y * size, z: 0 }))
  return { points, score, handedness }
}

/** Both hands held so the index tips meet at the top and the thumb tips meet below. */
export function heartHands(score = 0.93): Hand[] {
  const size = 0.15
  const mk = (cx: number, side: 'Left' | 'Right') => {
    const h = hand({ cx, cy: 0.78, size, pose: 'fist', score, handedness: side })
    const pts = h.points.map((p) => ({ ...p }))
    pts[LM.thumbTip] = { x: 0.5, y: 0.66 }
    pts[8] = { x: 0.5, y: 0.5 }
    return { ...h, points: pts }
  }
  return [mk(0.3, 'Left'), mk(0.7, 'Right')]
}

/** A stream of frames at ~30 fps built from a per-frame hand generator. */
export function stream(ms: number, make: (t: number, i: number) => Hand[], start = 0, fps = 30): Frame[] {
  const frames: Frame[] = []
  const step = 1000 / fps
  for (let t = 0, i = 0; t <= ms; t += step, i++) frames.push({ t: Math.round(start + t), hands: make(t, i) })
  return frames
}
