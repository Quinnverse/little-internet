import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Drawing } from '../../core/strokes.ts'
import {
  BLANK_LETTER,
  FONTS,
  PAPERS,
  PAPER_H,
  PAPER_W,
  STAMPS,
  STICKER_NAMES,
  TAPES,
  LetterSchema,
  addItem,
  letterIsEmpty,
  letterSummary,
  letterToSvg,
  newItemId,
  removeItem,
  restack,
  updateItem,
  type Letter,
  type LetterItem,
} from '../../core/letter.ts'
import { PEN_COLORS } from '../../core/strokes.ts'
import { spriteRects } from '../../core/pixels.ts'
import { idbDelete, idbGet, idbSet } from '../idb.ts'
import { pickImageFile } from '../images.ts'
import { getLang } from '../i18n.ts'
import { ta } from '../i18nAtelier.ts'
import { letterToPng, photoForLetter, voiceToDataUrl } from '../letterMedia.ts'
import { newClientId, sendQueued, type Person } from '../people.ts'
import { describeMicError, recordingSupported, startRecording, type RecorderHandle } from '../recorder.ts'
import { Sheet } from './common.tsx'
import { CameraControl } from './CameraControl.tsx'
import { DrawPad, type DrawPadHandle } from './DrawPad.tsx'
import type { Action } from '../../perception/router.ts'
import { Icon } from './icons.tsx'

const DRAFT = 'letter-draft'
const VOICE_LIMIT_MS = 20_000

const base = (): Omit<Extract<LetterItem, { t: 'sticker' }>, 't' | 'name' | 'id'> => ({ x: 500, y: 620, rot: 0, scale: 1 })

/** Ready-made starting points. They fill the paper with a few items so nobody starts from nothing. */
export function template(name: 'thinking' | 'thanks' | 'heart' | 'flower' | 'sea'): Letter {
  const zh = getLang() === 'zh'
  const text = (s: string, y: number, size = 54): LetterItem => ({ id: newItemId(), t: 'text', text: s, font: 'hand', color: '#5b3b27', size, x: 120, y, rot: -2, scale: 1 })
  switch (name) {
    case 'heart':
      return { v: 1, paper: 'cream', items: [{ id: newItemId(), t: 'sticker', name: 'heart', x: 500, y: 620, rot: 0, scale: 3.4 }] }
    case 'flower':
      return { v: 1, paper: 'floral', items: [{ id: newItemId(), t: 'sticker', name: 'flower', x: 500, y: 620, rot: -6, scale: 3.4 }] }
    case 'thanks':
      return {
        v: 1,
        paper: 'kraft',
        items: [{...text('FIELD STATION   /   07',170,30),font:'typewriter',rot:0} as LetterItem,{id:newItemId(),t:'tape',color:TAPES[0],x:590,y:995,rot:-12,scale:1.3},{id:newItemId(),t:'sticker',name:'flower',x:470,y:810,rot:-14,scale:3.2},text(zh ? '谢谢你。' : 'Thank you.', 300, 80), text(zh ? '你让今天好了一点。' : 'You made today a little better.', 440, 50), { id: newItemId(), t: 'seal', color: '#b33a3a', x: 780, y: 1080, rot: 0, scale: 1 }],
      }
    case 'sea':
      return {
        v: 1,
        paper: 'lined',
        items: [{...text('COASTAL POST   /   03',175,28),font:'typewriter',rot:0} as LetterItem,{id:newItemId(),t:'stamp',name:'postmark',label:'PORT 03',x:850,y:140,rot:9,scale:1.05},text(zh ? '想起你，\n在海边。' : 'Thinking of you,\nby the sea.', 260, 60), { id: newItemId(), t: 'sticker', name: 'shell', x: 740, y: 900, rot: 12, scale: 2.2 }, { id: newItemId(), t: 'tape', color: TAPES[2], x: 500, y: 90, rot: -4, scale: 1 }],
      }
    case 'thinking':
      return {
        v: 1,
        paper: 'night',
        items: [{...text('NIGHT LETTERS   /   01',220,29),color:'#c9c8dc',font:'typewriter',rot:0} as LetterItem,{...text(zh?'晚安，朋友。':'Dear night owl,',380,80),color:'#fff0ce',font:'serif',rot:0} as LetterItem,{...text(zh?'今晚窗外的月亮很亮。':'The moon kept your window lit.',575,42),color:'#f4e1ca'} as LetterItem,{id:newItemId(),t:'sticker',name:'moon',x:670,y:805,rot:0,scale:2}, { id: newItemId(), t: 'stamp', name: 'heart', x: 820, y: 170, rot: 8, scale: 1 }, { id: newItemId(), t: 'sticker', name: 'sparkle', x: 220, y: 900, rot: 0, scale: 2 }],
      }
  }
}

function hitBox(it: LetterItem): { left: number; top: number; w: number; h: number; center: boolean; origin: string } {
  const pct = (v: number, of: number) => (v / of) * 100
  if (it.t === 'text') {
    const lines = it.text.split('\n').slice(0, 12)
    const longest = Math.max(1, ...lines.map((l) => [...l].length))
    const w = Math.max(60, longest * it.size * 0.62) * it.scale
    const lineH = it.size * 1.25
    const h = lines.length * lineH * it.scale
    const asc = it.size * it.scale
    return { left: pct(it.x, PAPER_W), top: pct(it.y - asc, PAPER_H), w: pct(w, PAPER_W), h: pct(h, PAPER_H), center: false, origin: `0 ${(asc / h) * 100}%` }
  }
  const dims: Record<string, [number, number]> = { sticker: [128, 128], seal: [124, 124], tape: [180, 48], stamp: [120, 140], photo: [380, 380], drawing: [700, 700] }
  const [w, h] = dims[it.t]!
  return { left: pct(it.x, PAPER_W), top: pct(it.y, PAPER_H), w: pct(w * it.scale, PAPER_W), h: pct(h * it.scale, PAPER_H), center: true, origin: '50% 50%' }
}

type Mode = 'edit' | 'draw' | 'send'

export function LetterAtelier(props: {
  slug: string
  server: string
  friends: Person[]
  initial?: Letter
  initialTo?: string
  onClose: () => void
  onSent: (to: string) => void
  toast: (m: string, kind?: 'ok' | 'error') => void
}) {
  const [letter, setLetter] = useState<Letter>(props.initial ?? BLANK_LETTER)
  const past = useRef<Letter[]>([])
  const future = useRef<Letter[]>([])
  const [, bump] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('edit')
  const [busy, setBusy] = useState('')
  const [to, setTo] = useState(props.initialTo ?? '')
  const [shareable, setShareable] = useState(false)
  const [status, setStatus] = useState<{ kind: 'sending' | 'failed' | 'sent'; text: string } | null>(null)
  const rec = useRef<RecorderHandle | null>(null)
  const [recording, setRecording] = useState(false)
  const paperRef = useRef<HTMLDivElement>(null)
  const sentOnce = useRef(false)
  const clientId = useRef(newClientId())
  const penRef = useRef<DrawPadHandle | null>(null)
  const [calibrating,setCalibrating]=useState(false)
  const [remaining,setRemaining]=useState(30)
  const [gain,setGain]=useState(1)
  const [cursor,setCursor]=useState({x:.5,y:.5,down:false})
  useEffect(()=>{
    if(!calibrating)return
    const until=performance.now()+30000
    const tick=setInterval(()=>{const left=Math.max(0,Math.ceil((until-performance.now())/1000));setRemaining(left);if(!left)setCalibrating(false)},200)
    return ()=>clearInterval(tick)
  },[calibrating])
  const calibrated=(n:number)=>Math.max(0,Math.min(1,.5+(n-.5)*gain))
  const [proposal, setProposal] = useState(false)

  // A draft is kept on this device only, so closing by accident loses nothing.
  useEffect(() => {
    if (props.initial) return
    void idbGet<Letter>(DRAFT).then((d) => {
      if (!d) return
      const ok = LetterSchema.safeParse(d)
      if (ok.success && !letterIsEmpty(ok.data)) setLetter(ok.data)
    })
  }, [])
  useEffect(() => {
    const id = window.setTimeout(() => void (letterIsEmpty(letter) ? idbDelete(DRAFT) : idbSet(DRAFT, letter)).catch(() => {}), 500)
    return () => window.clearTimeout(id)
  }, [letter])
  useEffect(() => () => rec.current?.cancel(), [])

  const commit = (next: Letter) => {
    past.current.push(letter)
    if (past.current.length > 60) past.current.shift()
    future.current = []
    setLetter(next)
    bump((n) => n + 1)
  }
  const undo = () => {
    const p = past.current.pop()
    if (!p) return
    future.current.push(letter)
    setLetter(p)
    bump((n) => n + 1)
  }
  const redo = () => {
    const f = future.current.pop()
    if (!f) return
    past.current.push(letter)
    setLetter(f)
    bump((n) => n + 1)
  }

  const svg = useMemo(() => letterToSvg(letter, { width: 560 }), [letter])
  const selected = letter.items.find((i) => i.id === sel) ?? null
  const full = letter.items.length >= 40

  const add = (it: LetterItem) => {
    if (full) return props.toast(ta('let.full'), 'error')
    commit(addItem(letter, it))
    setSel(it.id)
  }

  const onDrag = (it: LetterItem, e: PointerEvent) => {
    e.preventDefault()
    setSel(it.id)
    const el = paperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const k = PAPER_W / rect.width
    const sx = e.clientX
    const sy = e.clientY
    const ox = it.x
    const oy = it.y
    const before = letter
    let moved = false
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const move = (m: PointerEvent) => {
      const nx = Math.max(-80, Math.min(1080, ox + (m.clientX - sx) * k))
      const ny = Math.max(-80, Math.min(1380, oy + (m.clientY - sy) * k))
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return
      moved = true
      setLetter(updateItem(before, it.id, { x: Math.round(nx), y: Math.round(ny) }))
    }
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      if (moved) {
        past.current.push(before)
        future.current = []
        bump((n) => n + 1)
      }
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const tweak = (patch: Record<string, unknown>) => selected && commit(updateItem(letter, selected.id, patch))
  const nudge = (key: 'x' | 'y', d: number) => selected && tweak({ [key]: Math.max(-80, Math.min(key === 'x' ? 1080 : 1380, selected[key] + d)) })

  const onKey = (e: KeyboardEvent) => {
    if (!selected || (e.target as HTMLElement).closest('textarea,input,select')) return
    const step = e.shiftKey ? 40 : 10
    if (e.key === 'ArrowLeft') nudge('x', -step)
    else if (e.key === 'ArrowRight') nudge('x', step)
    else if (e.key === 'ArrowUp') nudge('y', -step)
    else if (e.key === 'ArrowDown') nudge('y', step)
    else if (e.key === 'Delete' || e.key === 'Backspace') commit(removeItem(letter, selected.id)), setSel(null)
    else return
    e.preventDefault()
  }

  const addPhoto = async () => {
    try {
      const f = await pickImageFile()
      if (!f) return
      setBusy(ta('let.shrinking'))
      const data = await photoForLetter(f)
      add({ id: newItemId(), t: 'photo', data, frame: true, x: 500, y: 640, rot: -3, scale: 1 })
    } catch (e) {
      props.toast((e as Error).message, 'error')
    } finally {
      setBusy('')
    }
  }

  const toggleVoice = async () => {
    if (recording) {
      try {
        const r = await rec.current!.stop()
        rec.current = null
        setRecording(false)
        commit({ ...letter, voice: { mime: r.mime as 'audio/webm', data: voiceToDataUrl(r.mime, r.data), ms: Math.min(30_000, r.durationMs) } })
      } catch (e) {
        setRecording(false)
        props.toast((e as Error).message, 'error')
      }
      return
    }
    try {
      const h = await startRecording(() => {})
      rec.current = h
      setRecording(true)
      window.setTimeout(() => {
        if (rec.current === h) void toggleVoice()
      }, VOICE_LIMIT_MS)
    } catch (e) {
      props.toast(describeMicError(e), 'error')
    }
  }

  const send = async (l: Letter = letter) => {
    if (sentOnce.current) return
    const parsed = LetterSchema.safeParse(l)
    if (!parsed.success) return setStatus({ kind: 'failed', text: ta('let.invalid') })
    if (letterIsEmpty(parsed.data)) return setStatus({ kind: 'failed', text: ta('let.empty') })
    if (!to) return setStatus({ kind: 'failed', text: ta('let.pickFriend') })
    setStatus({ kind: 'sending', text: ta('let.sending') })
    const r = await sendQueued(props.slug, props.server, {
      clientId: clientId.current,
      to,
      letter: parsed.data,
      summary: letterSummary(parsed.data, getLang()),
      shareable,
      createdAt: new Date().toISOString(),
    })
    if (r.ok) {
      sentOnce.current = true
      setStatus({ kind: 'sent', text: ta('let.sent', { to }) })
      void idbDelete(DRAFT)
      props.onSent(to)
    } else {
      setStatus({ kind: 'failed', text: r.retry ? ta('let.failedRetry', { why: r.error }) : ta('let.failed', { why: r.error }) })
    }
  }

  // ---------------------------------------------------------------- views
  if (mode === 'draw') {
    return (
      <Sheet title={ta('draw.title')} onClose={() => setMode('edit')} wide>
        <DrawPad
          dark={letter.paper === 'night'}
          onCancel={() => setMode('edit')}
          onHandle={(h) => (penRef.current = h)}
          extra={<>
            <label>{getLang()==='zh'?'指尖灵敏度':'Pointer sensitivity'} <input type="range" min=".65" max="1.6" step=".05" value={gain} onInput={e=>setGain(Number(e.currentTarget.value))}/></label>
            <button class="btn btn-small" onClick={()=>{penRef.current?.end();setRemaining(30);setCalibrating(!calibrating)}}>{calibrating?'✓ '+remaining+'s':'30s · '+(getLang()==='zh'?'校准':'Calibrate')}</button>
            {calibrating&&<div class="calibrate-pad"><span style={{left:cursor.x*100+'%',top:cursor.y*100+'%',background:cursor.down?'#973c50':'#347e7a'}}/><small>{getLang()==='zh'?'移动食指到左右两侧，然后捏合、松开。练习不会写入信纸。':'Point left and right, pinch and release. Practice stays off the letter.'}</small></div>}
            <CameraControl
              mode="draw"
              hint={ta('cam.drawHint')}
              onAction={(a: Action) => {
                if(calibrating){
                  if(a.kind==='draw'||a.kind==='cursor')setCursor({x:calibrated(a.x),y:calibrated(a.y),down:a.kind==='draw'&&a.op!=='end'})
                  return
                }
                const h = penRef.current
                if (!h || a.kind !== 'draw') return
                if (a.op === 'begin') h.begin()
                if (a.op !== 'end') h.point(calibrated(a.x) * 1000, calibrated(a.y) * 1000, performance.now())
                else h.end()
              }}
            /></>
          }
          onDone={(d: Drawing | null) => {
            setMode('edit')
            if (d && d.strokes.length) add({ id: newItemId(), t: 'drawing', drawing: d, x: 500, y: 650, rot: 0, scale: 0.7 })
          }}
        />
      </Sheet>
    )
  }

  if (mode === 'send') {
    return (
      <Sheet title={ta('let.sendTitle')} onClose={() => setMode('edit')} wide>
        <div class="letter-send">
          <div class="letter-preview" dangerouslySetInnerHTML={{ __html: letterToSvg(letter, { width: 280 }) }} role="img" aria-label={letterSummary(letter, getLang()) || ta('let.title')} />
          <div class="letter-send-form">
            {props.friends.length === 0 ? (
              <p class="muted">{ta('let.noFriends')}</p>
            ) : (
              <fieldset class="field">
                <legend class="field-label">{ta('let.to')}</legend>
                {props.friends.map((f) => (
                  <label key={f.slug} class="switch-row">
                    <input type="radio" name="to" checked={to === f.slug} onChange={() => setTo(f.slug)} />
                    <span>{f.title || f.slug} <span class="muted small">@{f.slug}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            <label class="switch-row">
              <input type="checkbox" checked={shareable} onChange={(e) => setShareable((e.currentTarget as HTMLInputElement).checked)} />
              <span>{ta('let.shareable')}</span>
            </label>
            <p class="muted small">{ta('let.shareableHint')}</p>
            <CameraControl mode="send" hint={ta('cam.sendHint')} onAction={(a: Action) => a.kind === 'propose-gift' && setProposal(true)} />
            {proposal && status?.kind !== 'sent' && (
              <div class="cam-proposal" role="group" aria-label={ta('cam.proposal', { to: to || '…' })}>
                <p>{to ? ta('cam.proposal', { to }) : ta('let.pickFriend')}</p>
                <div class="choice-row">
                  <button
                    type="button"
                    class="btn btn-primary btn-small"
                    disabled={!to || status?.kind === 'sending'}
                    onClick={() => {
                      const heart = template('heart')
                      setLetter(heart)
                      setProposal(false)
                      void send(heart)
                    }}
                  >
                    {ta('cam.proposalYes')}
                  </button>
                  <button type="button" class="btn btn-small" onClick={() => setProposal(false)}>{ta('cam.proposalNo')}</button>
                </div>
              </div>
            )}
            {status && (
              <p class={`small ${status.kind === 'failed' ? 'error' : ''}`} role={status.kind === 'failed' ? 'alert' : 'status'} data-state={status.kind}>
                {status.text}
              </p>
            )}
            <div class="sheet-actions">
              <button type="button" class="btn" onClick={() => setMode('edit')}>{ta('let.back')}</button>
              <button type="button" class="btn btn-primary" disabled={status?.kind === 'sending' || status?.kind === 'sent' || !to} onClick={() => void send(letter)}>
                <Icon name="mail" size={18} /> {status?.kind === 'failed' ? ta('let.retry') : ta('let.send')}
              </button>
              {status?.kind === 'sent' && <button type="button" class="btn" onClick={props.onClose}>{ta('let.done')}</button>}
            </div>
          </div>
        </div>
      </Sheet>
    )
  }

  const stickerSvg = (name: string) => (
    <svg viewBox="0 0 16 16" width="30" height="30" shape-rendering="crispEdges" aria-hidden="true" dangerouslySetInnerHTML={{ __html: spriteRects(name as 'star') }} />
  )

  return (
    <Sheet title={ta('let.title')} onClose={props.onClose} wide>
      <div class="letter-editor" onKeyDown={onKey as unknown as (e: Event) => void}>
        <div class="letter-stage">
          <div class="letter-paper" ref={paperRef} onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}>
            <div class="letter-svg" dangerouslySetInnerHTML={{ __html: svg }} />
            {letter.items.map((it) => {
              const b = hitBox(it)
              return (
                <div
                  key={it.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${ta(`let.k.${it.t}`)}${it.id === sel ? ` (${ta('let.selected')})` : ''}`}
                  aria-pressed={it.id === sel}
                  class={`letter-hit${it.id === sel ? ' on' : ''}`}
                  style={{
                    left: `${b.left}%`,
                    top: `${b.top}%`,
                    width: `${b.w}%`,
                    height: `${b.h}%`,
                    transform: `${b.center ? 'translate(-50%,-50%) ' : ''}rotate(${it.rot}deg)`,
                    transformOrigin: b.origin,
                  }}
                  onPointerDown={(e) => onDrag(it, e as unknown as PointerEvent)}
                  onFocus={() => setSel(it.id)}
                />
              )
            })}
          </div>
          {busy && <p class="muted small" role="status">{busy}</p>}
        </div>

        <div class="letter-tools">
          <div class="choice-row" role="group" aria-label={ta('let.start')}>
            {(['thinking', 'thanks', 'sea', 'heart', 'flower'] as const).map((n) => (
              <button type="button" class="chip" key={n} onClick={() => commit(template(n))}>{ta(`let.t.${n}`)}</button>
            ))}
          </div>

          <div class="choice-row" role="group" aria-label={ta('let.paper')}>
            {PAPERS.map((p) => (
              <button type="button" key={p} class={`chip${letter.paper === p ? ' selected' : ''}`} aria-pressed={letter.paper === p} onClick={() => commit({ ...letter, paper: p })}>
                {ta(`let.p.${p}`)}
              </button>
            ))}
          </div>

          <div class="choice-row">
            <button type="button" class="btn btn-small" onClick={() => add({ id: newItemId(), t: 'text', text: ta('let.sampleText'), font: 'hand', color: letter.paper === 'night' ? '#fff6c2' : '#5b3b27', size: 56, x: 120, y: 360, rot: 0, scale: 1 })}>
              <Icon name="pen" size={16} /> {ta('let.addText')}
            </button>
            <button type="button" class="btn btn-small" onClick={() => setMode('draw')}><Icon name="palette" size={16} /> {ta('let.addDrawing')}</button>
            <button type="button" class="btn btn-small" onClick={() => void addPhoto()}><Icon name="photo" size={16} /> {ta('let.addPhoto')}</button>
            <button type="button" class="btn btn-small" disabled={!recordingSupported() && !letter.voice} onClick={() => void toggleVoice()} aria-pressed={recording}>
              <Icon name={recording ? 'stop' : 'mic'} size={16} /> {recording ? ta('let.stopVoice') : ta('let.addVoice')}
            </button>
            <button type="button" class="btn btn-small" onClick={() => add({ id: newItemId(), t: 'seal', color: '#b33a3a', x: 780, y: 1080, rot: 0, scale: 1 })}>{ta('let.addSeal')}</button>
            <button type="button" class="btn btn-small" onClick={() => add({ id: newItemId(), t: 'tape', color: TAPES[0], x: 500, y: 90, rot: -4, scale: 1 })}>{ta('let.addTape')}</button>
          </div>
          {letter.voice && (
            <div class="choice-row">
              <audio controls preload="none" src={letter.voice.data} aria-label={ta('let.voice')} />
              <button type="button" class="btn btn-small" onClick={() => commit({ ...letter, voice: undefined } as Letter)}>{ta('let.removeVoice')}</button>
            </div>
          )}

          <div class="choice-row" role="group" aria-label={ta('let.stickers')}>
            {STICKER_NAMES.map((n) => (
              <button type="button" class="sticker-btn" key={n} aria-label={n} title={n} onClick={() => add({ id: newItemId(), t: 'sticker', name: n, ...base(), scale: 1.4 })}>
                {stickerSvg(n)}
              </button>
            ))}
            {STAMPS.map((n) => (
              <button type="button" class="chip" key={n} onClick={() => add({ id: newItemId(), t: 'stamp', name: n, x: 820, y: 170, rot: 8, scale: 1 })}>
                {ta('let.stamp')}: {n}
              </button>
            ))}
          </div>

          {selected && (
            <div class="letter-sel" role="group" aria-label={ta('let.selectedTools')}>
              {selected.t === 'text' && (
                <>
                  <textarea
                    class="input"
                    rows={3}
                    maxLength={400}
                    aria-label={ta('let.text')}
                    value={selected.text}
                    onInput={(e) => setLetter(updateItem(letter, selected.id, { text: (e.currentTarget as HTMLTextAreaElement).value }))}
                    onBlur={() => bump((n) => n + 1)}
                  />
                  <div class="choice-row">
                    {FONTS.map((f) => (
                      <button type="button" key={f} class={`chip${selected.font === f ? ' selected' : ''}`} aria-pressed={selected.font === f} onClick={() => tweak({ font: f })}>{ta(`let.f.${f}`)}</button>
                    ))}
                  </div>
                  <div class="swatches" role="group" aria-label={ta('draw.color')}>
                    {PEN_COLORS.map((c) => (
                      <button type="button" key={c} class={`swatch${selected.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={selected.color === c} onClick={() => tweak({ color: c })} />
                    ))}
                  </div>
                </>
              )}
              {selected.t === 'photo' && (
                <label class="switch-row"><input type="checkbox" checked={selected.frame} onChange={(e) => tweak({ frame: (e.currentTarget as HTMLInputElement).checked })} /><span>{ta('let.frame')}</span></label>
              )}
              <div class="choice-row">
                <button type="button" class="icon-btn" aria-label={ta('let.rotL')} onClick={() => tweak({ rot: Math.max(-180, selected.rot - 10) })}><Icon name="rotl" /></button>
                <button type="button" class="icon-btn" aria-label={ta('let.rotR')} onClick={() => tweak({ rot: Math.min(180, selected.rot + 10) })}><Icon name="rotr" /></button>
                <button type="button" class="icon-btn" aria-label={ta('let.smaller')} onClick={() => tweak({ scale: Math.max(0.3, +(selected.scale / 1.15).toFixed(2)) })}>−</button>
                <button type="button" class="icon-btn" aria-label={ta('let.bigger')} onClick={() => tweak({ scale: Math.min(4, +(selected.scale * 1.15).toFixed(2)) })}>+</button>
                <button type="button" class="icon-btn" aria-label={ta('let.forward')} onClick={() => commit(restack(letter, selected.id, 1))}><Icon name="up" /></button>
                <button type="button" class="icon-btn" aria-label={ta('let.backward')} onClick={() => commit(restack(letter, selected.id, -1))}><Icon name="down" /></button>
                <button type="button" class="icon-btn" aria-label={ta('let.delete')} onClick={() => (commit(removeItem(letter, selected.id)), setSel(null))}><Icon name="trash" /></button>
              </div>
            </div>
          )}

          <div class="sheet-actions">
            <button type="button" class="icon-btn" disabled={!past.current.length} aria-label={ta('at.undo')} onClick={undo}><Icon name="undo" /></button>
            <button type="button" class="icon-btn" disabled={!future.current.length} aria-label={ta('at.redo')} onClick={redo}><Icon name="redo" /></button>
            <button type="button" class="btn" disabled={letterIsEmpty(letter)} onClick={() => commit(BLANK_LETTER)}>{ta('let.clear')}</button>
            <button type="button" class="btn btn-primary" disabled={letterIsEmpty(letter)} onClick={() => (setStatus(null), setMode('send'))}>
              <Icon name="mail" size={18} /> {ta('let.next')}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

export { letterToPng }
