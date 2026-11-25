import { z } from 'zod'
import { color } from './validators.ts'

/**
 * The one drawing model. Mouse, touch, pen and the camera's index finger (Air Drawing) all produce the same
 * Strokes, so a heart drawn in the air, a doodle on a phone and a sticker placed on a letter are the same kind
 * of thing. Coordinates live on a fixed 1000×1000 canvas. Pure: no DOM.
 */

export const CANVAS = 1000
export const MAX_STROKES = 300
export const MAX_POINTS = 1500

const coord = z.number().min(-200).max(CANVAS + 200)
export const StrokeSchema = z.object({
  /** [x, y] pairs, rounded to 1 decimal when stored. */
  pts: z.array(z.tuple([coord, coord])).min(1).max(MAX_POINTS),
  color,
  w: z.number().min(1).max(60),
  glow: z.boolean(),
})
export type Stroke = z.infer<typeof StrokeSchema>

export const DrawingSchema = z.object({
  v: z.literal(1),
  strokes: z.array(StrokeSchema).max(MAX_STROKES),
})
export type Drawing = z.infer<typeof DrawingSchema>

export const EMPTY_DRAWING: Drawing = { v: 1, strokes: [] }

export type Pen = { color: string; w: number; glow: boolean }
export const DEFAULT_PEN: Pen = { color: '#e0507a', w: 10, glow: false }
export const PEN_COLORS = ['#e0507a', '#ff8a3d', '#f2c230', '#4caf7d', '#3d8bff', '#8a5cf0', '#3a2a20', '#ffffff'] as const

const round = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

// ------------------------------------------------------------------ building a stroke from raw input

/**
 * Turns a noisy stream of points (a hand held in the air jitters by several pixels) into a smooth stroke.
 * A simplified one-euro filter: slow movement is smoothed hard (kills jitter), fast movement follows closely
 * (no lag when you sweep). Points closer than `minDist` to the previous kept point are dropped.
 */
export class StrokeBuilder {
  private raw: [number, number][] = []
  private fx = 0
  private fy = 0
  private lastT = 0
  private lastKeep: [number, number] | null = null
  private readonly pen: Pen
  private readonly opts: { smooth: boolean; minDist: number }
  constructor(pen: Pen, opts: { smooth: boolean; minDist: number } = { smooth: true, minDist: 2 }) {
    this.pen = pen
    this.opts = opts
  }

  /** Add a point in canvas units; `t` is a timestamp in ms (used to measure speed). */
  add(x: number, y: number, t: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    x = clamp(x, -200, CANVAS + 200)
    y = clamp(y, -200, CANVAS + 200)
    if (!this.opts.smooth || this.raw.length === 0) {
      this.fx = x
      this.fy = y
    } else {
      const dt = Math.max(1, t - this.lastT)
      const speed = Math.hypot(x - this.fx, y - this.fy) / dt // units per ms
      // alpha 0.09 (very smooth) when slow → 0.85 (follow) when fast. Tuned on measured jitter vs lag (see tests).
      const a = clamp(0.09 + speed * 0.18, 0.09, 0.85)
      this.fx += (x - this.fx) * a
      this.fy += (y - this.fy) * a
    }
    this.lastT = t
    const p: [number, number] = [round(this.fx), round(this.fy)]
    if (this.lastKeep && Math.hypot(p[0] - this.lastKeep[0], p[1] - this.lastKeep[1]) < this.opts.minDist) return
    this.lastKeep = p
    if (this.raw.length < MAX_POINTS) this.raw.push(p)
  }

  get length(): number {
    return this.raw.length
  }

  /** The stroke so far (a copy), or null when nothing was drawn. A single tap becomes a dot. */
  build(): Stroke | null {
    if (this.raw.length === 0) return null
    return { pts: this.raw.map((p) => [...p] as [number, number]), color: this.pen.color, w: this.pen.w, glow: this.pen.glow }
  }
}

// ------------------------------------------------------------------ editing (pure, undoable)

export class DrawingHistory {
  private past: Drawing[] = []
  private future: Drawing[] = []
  current: Drawing
  constructor(current: Drawing = EMPTY_DRAWING) {
    this.current = current
  }
  private push(next: Drawing) {
    this.past.push(this.current)
    if (this.past.length > 100) this.past.shift()
    this.current = next
    this.future = []
  }
  addStroke(s: Stroke): boolean {
    if (this.current.strokes.length >= MAX_STROKES) return false
    this.push({ v: 1, strokes: [...this.current.strokes, s] })
    return true
  }
  clear() {
    if (this.current.strokes.length) this.push(EMPTY_DRAWING)
  }
  undo(): boolean {
    const prev = this.past.pop()
    if (!prev) return false
    this.future.push(this.current)
    this.current = prev
    return true
  }
  redo(): boolean {
    const next = this.future.pop()
    if (!next) return false
    this.past.push(this.current)
    this.current = next
    return true
  }
  get canUndo() {
    return this.past.length > 0
  }
  get canRedo() {
    return this.future.length > 0
  }
}

// ------------------------------------------------------------------ geometry, shapes, output

export function bounds(d: Drawing): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of d.strokes) {
    const pad = s.w / 2
    for (const [x, y] of s.pts) {
      minX = Math.min(minX, x - pad)
      minY = Math.min(minY, y - pad)
      maxX = Math.max(maxX, x + pad)
      maxY = Math.max(maxY, y + pad)
    }
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Shape helpers: perfect templates the owner can add; they never replace what was drawn by hand. */
export function heartStroke(cx: number, cy: number, size: number, pen: Pen): Stroke {
  const pts: [number, number][] = []
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    pts.push([round(cx + (x / 17) * size), round(cy + (y / 17) * size)])
  }
  return { pts, color: pen.color, w: pen.w, glow: pen.glow }
}

export function starStroke(cx: number, cy: number, size: number, pen: Pen): Stroke {
  const pts: [number, number][] = []
  for (let i = 0; i <= 10; i++) {
    const r = i % 2 === 0 ? size : size * 0.42
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push([round(cx + Math.cos(a) * r), round(cy + Math.sin(a) * r)])
  }
  return { pts, color: pen.color, w: pen.w, glow: pen.glow }
}

export function flowerStroke(cx: number, cy: number, size: number, pen: Pen): Stroke {
  const pts: [number, number][] = []
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2
    const r = size * (0.55 + 0.45 * Math.abs(Math.cos(2.5 * a)))
    pts.push([round(cx + Math.cos(a) * r), round(cy + Math.sin(a) * r)])
  }
  return { pts, color: pen.color, w: pen.w, glow: pen.glow }
}

export const SHAPES = { heart: heartStroke, star: starStroke, flower: flowerStroke } as const
export type ShapeName = keyof typeof SHAPES

/** SVG path data for a stroke: straight for a dot, smooth quadratic curves through midpoints otherwise. */
export function strokePath(s: Stroke): string {
  const p = s.pts
  if (p.length === 1) return `M${p[0]![0]} ${p[0]![1]}l0.01 0`
  if (p.length === 2) return `M${p[0]![0]} ${p[0]![1]}L${p[1]![0]} ${p[1]![1]}`
  let d = `M${p[0]![0]} ${p[0]![1]}`
  for (let i = 1; i < p.length - 1; i++) {
    const mx = round((p[i]![0] + p[i + 1]![0]) / 2)
    const my = round((p[i]![1] + p[i + 1]![1]) / 2)
    d += `Q${p[i]![0]} ${p[i]![1]} ${mx} ${my}`
  }
  const last = p[p.length - 1]!
  return `${d}L${last[0]} ${last[1]}`
}

let uid = 0
/** SVG markup for the drawing's strokes (a <g>). Only numbers and validated #rrggbb colours are interpolated. */
export function drawingGroup(d: Drawing, idPrefix = 'dr'): string {
  const n = ++uid
  const parts: string[] = []
  let glowDef = false
  for (const s of d.strokes) {
    const path = `<path d="${strokePath(s)}" fill="none" stroke="${s.color}" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"${s.glow ? ` filter="url(#${idPrefix}${n}g)"` : ''}/>`
    if (s.glow) glowDef = true
    parts.push(path)
  }
  const defs = glowDef ? `<defs><filter id="${idPrefix}${n}g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` : ''
  return `${defs}<g>${parts.join('')}</g>`
}

/** A standalone SVG (cropped to the drawing with a margin) for download or a website sticker. */
export function drawingToSvg(d: Drawing, opts: { background?: string; margin?: number } = {}): string {
  const b = bounds(d) ?? { x: 0, y: 0, w: CANVAS, h: CANVAS }
  const m = opts.margin ?? 24
  const x = Math.floor(b.x - m)
  const y = Math.floor(b.y - m)
  const w = Math.ceil(b.w + m * 2)
  const h = Math.ceil(b.h + m * 2)
  const bg = opts.background && /^#[0-9a-f]{6}$/.test(opts.background) ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts.background}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${Math.min(w, 800)}" height="${Math.round((Math.min(w, 800) * h) / w)}">${bg}${drawingGroup(d)}</svg>`
}

/**
 * Animated version: each stroke is revealed in order with stroke-dashoffset (SMIL-free, CSS-free: uses SVG
 * <animate>, which browsers play inside <img>). Used for "animated handwriting" stickers.
 */
export function drawingToAnimatedSvg(d: Drawing, opts: { secondsPerStroke?: number } = {}): string {
  const sec = opts.secondsPerStroke ?? 0.9
  const b = bounds(d) ?? { x: 0, y: 0, w: CANVAS, h: CANVAS }
  const x = Math.floor(b.x - 24)
  const y = Math.floor(b.y - 24)
  const w = Math.ceil(b.w + 48)
  const h = Math.ceil(b.h + 48)
  let t = 0
  const paths = d.strokes
    .map((s) => {
      let len = 0
      for (let i = 1; i < s.pts.length; i++) len += Math.hypot(s.pts[i]![0] - s.pts[i - 1]![0], s.pts[i]![1] - s.pts[i - 1]![1])
      len = Math.max(1, Math.ceil(len * 1.1))
      const begin = t.toFixed(2)
      t += sec
      return `<path d="${strokePath(s)}" fill="none" stroke="${s.color}" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${len}" stroke-dashoffset="${len}"><animate attributeName="stroke-dashoffset" from="${len}" to="0" dur="${sec}s" begin="${begin}s" fill="freeze"/></path>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${Math.min(w, 800)}" height="${Math.round((Math.min(w, 800) * h) / w)}">${paths}</svg>`
}
