import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  CANVAS,
  DEFAULT_PEN,
  DrawingHistory,
  PEN_COLORS,
  SHAPES,
  StrokeBuilder,
  strokePath,
  type Drawing,
  type Pen,
  type ShapeName,
  type Stroke,
} from '../../core/strokes.ts'
import { ta } from '../i18nAtelier.ts'
import { Icon } from './icons.tsx'

/** Paints strokes (and an optional live stroke) onto a 1000×1000 canvas drawn at any CSS size. */
export function paintStrokes(ctx: CanvasRenderingContext2D, size: number, strokes: readonly Stroke[], paper?: string) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, size, size)
  if (paper) {
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, size, size)
  }
  const k = size / CANVAS
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.w
    ctx.shadowColor = s.glow ? s.color : 'transparent'
    ctx.shadowBlur = s.glow ? 18 : 0
    ctx.stroke(new Path2D(strokePath(s)))
  }
  ctx.shadowBlur = 0
}

export type DrawPadHandle = {
  /** Feed points from another input (the camera's index finger). Canvas units, `t` in ms. */
  begin: () => void
  point: (x: number, y: number, t: number) => void
  end: () => void
}

/**
 * A plain drawing pad: mouse, touch and pen. Also exposes a handle so Air Drawing can feed the same builder.
 * `smooth` removes hand jitter; `shape` adds a clean template next to (never instead of) what you drew.
 */
export function DrawPad(props: {
  initial?: Drawing
  paper?: string
  dark?: boolean
  onDone: (d: Drawing | null) => void
  onCancel: () => void
  /** Called once with a handle for external input (Air Drawing). */
  onHandle?: (h: DrawPadHandle | null) => void
  /** Extra controls shown in the toolbar (e.g. the camera button). */
  extra?: preact.ComponentChildren
  /** Live status text for assistive tech (e.g. "pen down"). */
  status?: string
}) {
  const [hist] = useState(() => new DrawingHistory(props.initial))
  const [, bump] = useState(0)
  const [pen, setPen] = useState<Pen>({ ...DEFAULT_PEN })
  const [smooth, setSmooth] = useState(true)
  const cv = useRef<HTMLCanvasElement>(null)
  const live = useRef<StrokeBuilder | null>(null)
  const penRef = useRef(pen)
  penRef.current = pen
  const smoothRef = useRef(smooth)
  smoothRef.current = smooth
  const size = useRef(500)

  const redraw = () => {
    const c = cv.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const strokes = [...hist.current.strokes]
    const l = live.current?.build()
    if (l) strokes.push(l)
    paintStrokes(ctx, c.width, strokes, props.paper)
  }

  const fit = () => {
    const c = cv.current
    if (!c) return
    const w = Math.round(c.clientWidth * Math.min(2, window.devicePixelRatio || 1))
    if (w > 0 && c.width !== w) {
      c.width = w
      c.height = w
      size.current = w
    }
    redraw()
  }
  useEffect(() => {
    fit()
    const ro = new ResizeObserver(fit)
    if (cv.current) ro.observe(cv.current)
    return () => ro.disconnect()
  }, [])

  const begin = () => {
    live.current = new StrokeBuilder({ ...penRef.current }, { smooth: smoothRef.current, minDist: 1.5 })
  }
  const point = (x: number, y: number, t: number) => {
    live.current?.add(x, y, t)
    redraw()
  }
  const end = () => {
    const s = live.current?.build()
    live.current = null
    if (s) hist.addStroke(s)
    bump((n) => n + 1)
    redraw()
  }

  useEffect(() => {
    props.onHandle?.({ begin, point, end })
    return () => props.onHandle?.(null)
  }, [])

  const toCanvas = (e: PointerEvent) => {
    const r = cv.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * CANVAS, ((e.clientY - r.top) / r.height) * CANVAS] as const
  }

  const addShape = (name: ShapeName) => {
    const s = SHAPES[name](500, 500, 280, pen)
    hist.addStroke(s)
    bump((n) => n + 1)
    redraw()
  }

  const nonEmpty = hist.current.strokes.length > 0
  return (
    <div class="drawpad" role="group" aria-label={ta('draw.title')}>
      <canvas
        ref={cv}
        class={`drawpad-canvas${props.dark ? ' dark' : ''}`}
        aria-label={ta('draw.canvas')}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
          begin()
          const [x, y] = toCanvas(e)
          point(x, y, e.timeStamp)
        }}
        onPointerMove={(e) => {
          if (!live.current) return
          e.preventDefault()
          // Coalesced events keep fast strokes smooth on touch screens.
          const list = (e as unknown as { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents?.() ?? [e]
          for (const ev of list.length ? list : [e]) {
            const [x, y] = toCanvas(ev)
            live.current?.add(x, y, ev.timeStamp)
          }
          redraw()
        }}
        onPointerUp={() => end()}
        onPointerCancel={() => end()}
      />

      <div class="drawpad-tools">
        <div class="swatches" role="group" aria-label={ta('draw.color')}>
          {PEN_COLORS.map((c) => (
            <button type="button" key={c} class={`swatch${pen.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={pen.color === c} onClick={() => setPen({ ...pen, color: c })} />
          ))}
        </div>
        <label class="at-range">
          <span class="field-label">{ta('draw.width')}</span>
          <input type="range" min={3} max={36} value={pen.w} onInput={(e) => setPen({ ...pen, w: Number(e.currentTarget.value) })} />
        </label>
        <div class="choice-row">
          <label class="switch-row">
            <input type="checkbox" checked={pen.glow} onChange={(e) => setPen({ ...pen, glow: e.currentTarget.checked })} />
            <span>{ta('draw.glow')}</span>
          </label>
          <label class="switch-row">
            <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.currentTarget.checked)} />
            <span>{ta('draw.smooth')}</span>
          </label>
        </div>
        <div class="choice-row" role="group" aria-label={ta('draw.shapes')}>
          {(['heart', 'star', 'flower'] as ShapeName[]).map((n) => (
            <button type="button" class="btn btn-small" key={n} onClick={() => addShape(n)}>
              + {ta(`draw.${n}`)}
            </button>
          ))}
        </div>
        <div class="choice-row">
          <button type="button" class="icon-btn" disabled={!hist.canUndo} aria-label={ta('at.undo')} onClick={() => (hist.undo(), bump((n) => n + 1), redraw())}>
            <Icon name="undo" />
          </button>
          <button type="button" class="icon-btn" disabled={!hist.canRedo} aria-label={ta('at.redo')} onClick={() => (hist.redo(), bump((n) => n + 1), redraw())}>
            <Icon name="redo" />
          </button>
          <button type="button" class="btn btn-small" disabled={!nonEmpty} onClick={() => (hist.clear(), bump((n) => n + 1), redraw())}>
            {ta('draw.clear')}
          </button>
          {props.extra}
        </div>
        {props.status && <p class="muted small" role="status">{props.status}</p>}
        <div class="sheet-actions">
          <button type="button" class="btn" onClick={props.onCancel}>{ta('pubm.cancel')}</button>
          <button type="button" class="btn btn-primary" disabled={!nonEmpty} onClick={() => props.onDone(hist.current)}>
            <Icon name="check" size={18} /> {ta('draw.use')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Keeps `useMemo` import used for tree-shaking friendliness in this file's callers. */
export const _unused = useMemo
