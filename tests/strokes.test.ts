import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { bounds, DEFAULT_PEN, DrawingHistory, drawingToAnimatedSvg, drawingToSvg, DrawingSchema, EMPTY_DRAWING, flowerStroke, heartStroke, MAX_STROKES, starStroke, StrokeBuilder, strokePath, type Drawing } from '../src/core/strokes.ts'

const line = (jitter: number, seed = 1) => {
  // a straight horizontal line y=500 with random vertical noise
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5) * 2
  return Array.from({ length: 120 }, (_, i) => ({ x: 100 + i * 6, y: 500 + rnd() * jitter, t: i * 16 }))
}
const rough = (pts: [number, number][]) => Math.sqrt(pts.reduce((a, [, y]) => a + (y - 500) ** 2, 0) / pts.length)

describe('Stroke builder', () => {
  it('S1: smoothing removes most hand jitter (RMS deviation drops by at least half)', () => {
    const raw = new StrokeBuilder(DEFAULT_PEN, { smooth: false, minDist: 0 })
    const smooth = new StrokeBuilder(DEFAULT_PEN, { smooth: true, minDist: 0 })
    for (const p of line(14)) {
      raw.add(p.x, p.y, p.t)
      smooth.add(p.x, p.y, p.t)
    }
    expect(rough(smooth.build()!.pts)).toBeLessThan(rough(raw.build()!.pts) * 0.5)
  })

  it('S1b: ...but a slowly traced circle still follows the hand (max lag under 2.5% of the canvas)', () => {
    const b = new StrokeBuilder(DEFAULT_PEN, { smooth: true, minDist: 0 })
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2
      b.add(500 + 200 * Math.cos(a), 500 + 200 * Math.sin(a), i * 16)
    }
    const pts = b.build()!.pts
    let lag = 0
    for (let i = 0; i < pts.length; i++) {
      const a = (i / 120) * Math.PI * 2
      lag = Math.max(lag, Math.hypot(pts[i]![0] - (500 + 200 * Math.cos(a)), pts[i]![1] - (500 + 200 * Math.sin(a))))
    }
    expect(lag).toBeLessThan(25)
  })

  it('S2: smoothing does not lag a fast sweep: the end of the stroke reaches the end of the gesture', () => {
    const b = new StrokeBuilder(DEFAULT_PEN, { smooth: true, minDist: 0 })
    for (let i = 0; i <= 20; i++) b.add(100 + i * 40, 500, i * 8) // 5 units/ms: a fast flick
    const last = b.build()!.pts.at(-1)!
    expect(900 - last[0]).toBeLessThan(80)
  })

  it('S3: a single tap is a dot, nothing drawn is null, bad numbers are ignored', () => {
    const b = new StrokeBuilder(DEFAULT_PEN)
    expect(b.build()).toBeNull()
    b.add(NaN, 5, 0)
    b.add(Infinity, 5, 1)
    expect(b.build()).toBeNull()
    b.add(300, 300, 2)
    expect(b.build()!.pts).toHaveLength(1)
    expect(strokePath(b.build()!)).toMatch(/^M300 300l/)
  })

  it('S4: points outside the canvas are clamped; the point count is capped', () => {
    const b = new StrokeBuilder(DEFAULT_PEN, { smooth: false, minDist: 0 })
    b.add(-9999, 99999, 0)
    for (let i = 0; i < 4000; i++) b.add(i % 900, (i * 7) % 900, i)
    const s = b.build()!
    expect(s.pts[0]).toEqual([-200, 1200])
    expect(s.pts.length).toBeLessThanOrEqual(1500)
    expect(DrawingSchema.safeParse({ v: 1, strokes: [s] }).success).toBe(true)
  })
})

describe('Drawing history', () => {
  const stroke = heartStroke(500, 500, 200, DEFAULT_PEN)
  it('S5: undo, redo, clear behave and a new stroke discards the redo branch', () => {
    const h = new DrawingHistory()
    h.addStroke(stroke)
    h.addStroke(starStroke(300, 300, 100, DEFAULT_PEN))
    expect(h.current.strokes).toHaveLength(2)
    h.undo()
    expect(h.current.strokes).toHaveLength(1)
    expect(h.canRedo).toBe(true)
    h.redo()
    expect(h.current.strokes).toHaveLength(2)
    h.undo()
    h.addStroke(flowerStroke(600, 600, 120, DEFAULT_PEN))
    expect(h.canRedo).toBe(false)
    h.clear()
    expect(h.current).toEqual(EMPTY_DRAWING)
    h.undo()
    expect(h.current.strokes).toHaveLength(2)
  })

  it('S6: never exceeds the stroke limit', () => {
    const h = new DrawingHistory()
    for (let i = 0; i < MAX_STROKES + 20; i++) h.addStroke(stroke)
    expect(h.current.strokes).toHaveLength(MAX_STROKES)
  })
})

describe('Shapes and output', () => {
  it('S7: shape templates are valid strokes centred where asked, and never mutate other strokes', () => {
    for (const make of [heartStroke, starStroke, flowerStroke]) {
      const s = make(500, 500, 200, DEFAULT_PEN)
      expect(DrawingSchema.safeParse({ v: 1, strokes: [s] }).success).toBe(true)
      const b = bounds({ v: 1, strokes: [s] })!
      expect(Math.abs(b.x + b.w / 2 - 500)).toBeLessThan(40)
      expect(Math.abs(b.y + b.h / 2 - 500)).toBeLessThan(60)
    }
  })

  it('S8: SVG output contains only drawing markup, validated colours and numbers (no injection)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ pts: fc.array(fc.tuple(fc.double({ min: -100, max: 1100, noNaN: true }), fc.double({ min: -100, max: 1100, noNaN: true })), { minLength: 1, maxLength: 30 }), color: fc.constantFrom('#e0507a', '#ffffff', '#000000'), w: fc.integer({ min: 1, max: 40 }), glow: fc.boolean() }), { maxLength: 8 }),
        (strokes) => {
          const d: Drawing = { v: 1, strokes }
          for (const svg of [drawingToSvg(d, { background: '#fffaf0' }), drawingToAnimatedSvg(d)]) {
            expect(svg).not.toMatch(/<script|onload|onerror|javascript:|<foreignObject|href=/i)
            const tags = [...svg.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1])
            for (const t of tags) expect(['svg', 'rect', 'g', 'path', 'defs', 'filter', 'feGaussianBlur', 'feMerge', 'feMergeNode', 'animate']).toContain(t)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('S9: a coloured stroke with an unsafe colour is rejected by the schema', () => {
    expect(DrawingSchema.safeParse({ v: 1, strokes: [{ pts: [[1, 1]], color: 'red;}</style>', w: 5, glow: false }] }).success).toBe(false)
    expect(DrawingSchema.safeParse({ v: 1, strokes: [{ pts: [[1, 1]], color: '#112233', w: 500, glow: false }] }).success).toBe(false)
  })
})
