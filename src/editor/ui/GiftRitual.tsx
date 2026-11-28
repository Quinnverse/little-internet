import { useEffect, useRef, useState } from 'preact/hooks'
import type { Ctx } from './common.tsx'
import { primeSound, sfx } from './sfx.ts'

/** A gift is not a card. It is a small ceremony: a sealed envelope, a sky, twelve chances to look
 *  closer, and one letter that stays. The room is the last beat — the thing you unwrap ends up on
 *  your shelf, not in a modal. */
const ITEMS = [
  { g: '✶', t: 'A star', l: 'So the ceiling is never quite dark.' },
  { g: '❋', t: 'A sprig', l: 'Pressed between two pages, still green.' },
  { g: '◍', t: 'A cup', l: 'Warm on the side you hold.' },
  { g: '⌾', t: 'A record', l: 'One song, played at the wrong hour on purpose.' },
  { g: '⌘', t: 'A key', l: 'It opens nothing. Keep it anyway.' },
  { g: '✧', t: 'A window', l: 'Cut to the size of a winter evening.' },
  { g: '☾', t: 'A moon', l: 'A little out of focus, like the real one.' },
  { g: '❍', t: 'A pebble', l: 'From a beach neither of us can name.' },
  { g: '⌗', t: 'A thread', l: 'For the thing you have not finished yet.' },
  { g: '❑', t: 'A stamp', l: 'Cancelled, but never sent anywhere.' },
  { g: '✿', t: 'A seed', l: 'Water it badly. It will forgive you.' },
  { g: '✦', t: 'A light', l: 'This one is yours. Leave it on.' },
]

function Stars({ dim }: { dim: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')
    if (!g) return
    let raf = 0
    let t = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pts = Array.from({ length: 190 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.35, p: Math.random() * 6.28, s: 0.2 + Math.random() * 0.8,
    }))
    const draw = () => {
      const w = c.clientWidth
      const h = c.clientHeight
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr
        c.height = h * dpr
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      t += 0.01
      for (const p of pts) {
        const a = (0.28 + 0.5 * (Math.sin(t * p.s + p.p) * 0.5 + 0.5)) * (dim ? 0.55 : 1)
        g.beginPath()
        g.arc(p.x * w, (p.y + Math.sin(t * 0.2 + p.p) * 0.004) * h, p.r, 0, 6.2832)
        g.fillStyle = `rgba(255,242,214,${a})`
        g.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [dim])
  return <canvas class="gr-stars" ref={ref} aria-hidden="true" />
}

export function GiftRitual({ ctx, close, onKeep, lang }: { ctx: Ctx; close: () => void; onKeep: () => void; lang?: string }) {
  const zh = lang === 'zh'
  void ctx
  const [stage, setStage] = useState<'seal' | 'open' | 'kept'>('seal')
  const [opened, setOpened] = useState<number[]>([])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [close])

  const flip = (i: number) => {
    // Each panel is paper being torn, and the last needed panel rings the bell.
    sfx('paper')
    setOpened((o: number[]) => {
      if (o.includes(i)) return o
      const next = [...o, i]
      if (next.length === 5) window.setTimeout(() => sfx('chime'), 260)
      return next
    })
  }
  const enough = opened.length >= 5

  return (
    <div class={`gr ${stage}`} role="dialog" aria-modal="true" aria-label={zh ? '一份礼物' : 'A gift'}>
      <Stars dim={stage === 'kept'} />
      <button class="gr-x" onClick={close} aria-label={zh ? '先收起来' : 'Put it away'}>✕</button>

      {stage === 'seal' && (
        <div class="gr-stage gr-seal">
          <div class="gr-intro">
            <span class="gr-kicker">{zh ? '门口 · 一封没写地址的信' : 'at the door — a letter with no address'}</span>
            <h2>{zh ? '有人给你留了一点光' : 'Someone left you a little light'}</h2>
            <p>{zh ? '它来自一间你没去过的屋子。' : 'It comes from a room you have never been to.'}</p>
          </div>
          <div
            class="gr-env"
            onClick={() => {
              primeSound()
              sfx('stamp')
              setStage('open')
            }}
            role="button"
            tabIndex={0}
            aria-label={zh ? '拆开信封' : 'open the envelope'}
          >
            <div class="gr-env-flap" />
            <div class="gr-env-fold" aria-hidden="true" />
            <div class="gr-stamp" aria-hidden="true"><span>12</span></div>
            <div class="gr-wax"><span>L</span></div>
            <div class="gr-env-seal">{zh ? '拆开蜡封' : 'break the seal'}</div>
          </div>
          <p class="gr-hint">{zh ? '一共 12 格 · 拆到你想停为止' : 'twelve panels · open as many as you like'}</p>
        </div>
      )}

      {(stage === 'open' || stage === 'kept') && (
        <div class="gr-stage gr-body">
          <header class="gr-head">
            <span class="gr-kicker">{zh ? '圣诞夜 · 十二格' : 'an advent, kept in the dark'}</span>
            <h2>{zh ? '一格一格，把屋里点亮' : 'Open one a night'}</h2>
            <p>{zh ? '不用全部拆开。拆到你不想拆为止。' : 'You do not have to open them all. Stop when it feels like enough.'}</p>
          </header>

          <div class="gr-grid">
            {ITEMS.map((it, i) => {
              const on = opened.includes(i)
              return (
                <button key={i} class={`gr-flap ${on ? 'is-open' : ''}`} onClick={() => flip(i)} aria-label={`${zh ? '第' : 'panel '}${i + 1}`}>
                  <span class="gr-n">{String(i + 1).padStart(2, '0')}</span>
                  <span class="gr-g">{it.g}</span>
                  <span class="gr-t">{it.t}</span>
                  <span class="gr-l">{it.l}</span>
                </button>
              )
            })}
          </div>

          <div class={`gr-letter ${enough ? 'is-in' : ''}`}>
            <p class="gr-lines">
              <span>{zh ? '这些东西都不值钱。' : 'None of it is worth anything.'}</span>
              <span>{zh ? '但它们都待过同一个房间，' : 'But they all lived in the same room for a while,'}</span>
              <span>{zh ? '所以放在一起会亮。' : 'and that is why they glow when they sit together.'}</span>
            </p>
            <div class="gr-sign">
              <span>{zh ? '—— 你的，L' : '— yours, L'}</span>
              <i />
            </div>
            <div class="gr-acts">
              <button class="gr-primary" onClick={() => { onKeep(); setStage('kept') }}>{zh ? '放进屋里' : 'Keep it'}</button>
              <button class="gr-ghost" onClick={close}>{zh ? '留在门口' : 'Leave it'}</button>
            </div>
          </div>

          <footer class="gr-count">{opened.length} / 12 · {zh ? '拆开的都归你了' : 'what you opened is yours'}</footer>
        </div>
      )}

      {stage === 'kept' && (
        <div class="gr-kept" onClick={close} role="button" tabIndex={0}>
          <span>{zh ? '它已经在你的架子上了。' : 'It is on your shelf now.'}</span>
          <em>{zh ? '推门回去看看' : 'go back in and look'}</em>
        </div>
      )}
    </div>
  )
}
