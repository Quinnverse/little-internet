// Visitor runtime shipped inside every exported site as room.js.
// Rules: no network except the optional guestbook on the platform copy, no platform URLs,
// DOM built with textContent only, every value from room-data validated before use.
import { DECOR_KINDS, FLOORS, HOUSES, LIGHTS, MEMORY_KINDS, SLOTS, WALLS } from '../core/room.ts'
import type { RoomData } from '../core/roomData.ts'
import { fmt } from '../core/strings.ts'
import { svgIcon, type IconKey } from '../room3d/iconPaths.ts'
import { preloadModels } from '../room3d/models.ts'
import { isNightNow, RoomView, webglAvailable, type HomeData } from '../room3d/view.ts'

type T = RoomData['t']

const REL_POST = /^posts\/[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?\.html$/
const REL_ASSET = /^assets\/[a-z0-9_-]{1,40}\.(?:jpg|png|webp|gif)$/
const REL_AUDIO = /^audio\/[a-z0-9_-]{1,40}\.(?:webm|m4a|ogg|mp3)$/
const COLORS = ['white', 'mint', 'peach', 'lilac']

function oneOf<X extends string>(list: readonly X[], v: unknown, fallback: X): X {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as X) : fallback
}
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const int = (v: unknown, lo: number, hi: number) => (Number.isInteger(v) ? Math.max(lo, Math.min(hi, v as number)) : lo)

type Memory = { id: string; kind: (typeof MEMORY_KINDS)[number]; slot: string; title: string; href: string; thumb?: string }
type Entry = { title: string; href: string; date: string }
type Clean = {
  slug: string
  title: string
  tagline: string
  home: HomeData
  memory: Memory[]
  entries: Entry[]
  welcome?: { src: string; title: string; durationMs: number; createdAt: string }
  t: T
  petName: string
}

function clean(raw: unknown): Clean | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const tRaw = (d.t ?? {}) as Record<string, unknown>
  const t = new Proxy({} as T, { get: (_o, k) => str(tRaw[k as string], 400) }) as T
  const memory: Memory[] = []
  for (const m of Array.isArray(d.memory) ? d.memory.slice(0, 40) : []) {
    const o = m as Record<string, unknown>
    const href = str(o.href, 100)
    const slot = str(o.slot, 20)
    if (!REL_POST.test(href) || !SLOTS.includes(slot)) continue
    const thumb = str(o.thumb, 100)
    memory.push({
      id: str(o.id, 40).replace(/[^a-z0-9_-]/g, ''),
      kind: oneOf(MEMORY_KINDS, o.kind, 'book'),
      slot,
      title: str(o.title, 120),
      href,
      ...(REL_ASSET.test(thumb) ? { thumb } : {}),
    })
  }
  const entries: Entry[] = []
  for (const e of Array.isArray(d.entries) ? d.entries.slice(0, 40) : []) {
    const o = e as Record<string, unknown>
    const href = str(o.href, 100)
    if (REL_POST.test(href)) entries.push({ title: str(o.title, 120), href, date: str(o.date, 10) })
  }
  const w = d.welcome as Record<string, unknown> | undefined
  const src = str(w?.src, 100)
  const welcome = w && REL_AUDIO.test(src)
    ? { src, title: str(w.title, 80), durationMs: int(w.durationMs, 1, 60000), createdAt: str(w.createdAt, 10) }
    : undefined
  const pet = (d.pet ?? {}) as Record<string, unknown>
  const decor: HomeData['decor'] = []
  for (const x of Array.isArray(d.decor) ? d.decor.slice(0, 12) : []) {
    const o = x as Record<string, unknown>
    decor.push({ id: `d${decor.length}`, kind: oneOf(DECOR_KINDS, o.kind, 'plant'), x: int(o.x, 0, 5), z: int(o.z, 0, 5), rot: int(o.rot, 0, 3) })
  }
  const home: HomeData = {
    house: oneOf(HOUSES, d.house, 'cabin'),
    wall: oneOf(WALLS, d.wall, 'cream'),
    floor: oneOf(FLOORS, d.floor, 'oak'),
    light: oneOf(LIGHTS, d.light, 'auto'),
    decor,
    memory: memory.map(({ id, kind, slot, title, thumb }) => ({ id, kind, slot, title, ...(thumb ? { thumbUrl: thumb } : {}) })),
    welcome: !!welcome,
    pet: { enabled: pet.enabled !== false, name: str(pet.name, 24), color: oneOf(COLORS as ['white'], pet.color, 'white') },
  }
  return {
    slug: str(d.slug, 40),
    title: str(d.title, 80),
    tagline: str(d.tagline, 200),
    home,
    memory,
    entries,
    ...(welcome ? { welcome } : {}),
    t,
    petName: str(pet.name, 24),
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function iconBtn(cls: string, icon: IconKey | null, label: string): HTMLButtonElement {
  const b = el('button', cls)
  b.type = 'button'
  if (icon) b.insertAdjacentHTML('afterbegin', svgIcon(icon, 18))
  b.append(document.createTextNode(label))
  return b
}

/** A short two-note doorbell from the Web Audio API. Only called after a tap. */
function chime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ac = new AC()
    const now = ac.currentTime
    ;[[659.25, 0], [523.25, 0.32]].forEach(([f, at]) => {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = 'sine'
      o.frequency.value = f!
      g.gain.setValueAtTime(0.0001, now + at!)
      g.gain.exponentialRampToValueAtTime(0.25, now + at! + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + at! + 0.9)
      o.connect(g).connect(ac.destination)
      o.start(now + at!)
      o.stop(now + at! + 1)
    })
    window.setTimeout(() => void ac.close(), 1800)
  } catch {
    /* no audio: the visual ring is enough */
  }
}

function start(c: Clean) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const page = document.querySelector('.wrap') as (HTMLElement & { inert?: boolean }) | null
  const root = el('div', 'li-room li-labels')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', c.title)
  const stage = el('div', 'li-stage is-day')
  const top = el('div', 'li-top')
  const title = el('p', 'li-title', c.title)
  const actions = el('div', 'li-actions')
  const siteBtn = iconBtn('li-btn', 'book', c.t.website)
  actions.append(siteBtn)
  top.append(title, actions)
  const fade = el('div', 'li-fade')
  root.append(stage, top, fade)
  document.body.append(root)
  document.documentElement.classList.add('li-lock')
  if (page) page.inert = true

  let disposed = false
  let card: HTMLElement | null = null
  let audio: HTMLAudioElement | null = null
  let night = isNightNow(c.home.light)

  const close = () => {
    if (disposed) return
    disposed = true
    audio?.pause()
    view.dispose()
    root.remove()
    document.documentElement.classList.remove('li-lock')
    if (page) page.inert = false
    document.removeEventListener('keydown', onKey)
    ;(document.querySelector('.site-title a') as HTMLElement | null)?.focus()
  }

  const closeCard = () => {
    card?.remove()
    card = null
    view.resetView()
  }

  const openCard = (build: (box: HTMLElement) => void, label: string) => {
    card?.remove()
    const box = el('div', 'li-card')
    box.setAttribute('role', 'region')
    box.setAttribute('aria-label', label)
    const x = iconBtn('li-btn li-close', 'close', '')
    x.setAttribute('aria-label', c.t.close)
    x.addEventListener('click', closeCard)
    box.append(x)
    build(box)
    root.append(box)
    card = box
    ;(box.querySelector('a,button:not(.li-close),input') as HTMLElement | null)?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (card) closeCard()
    else close()
  }
  document.addEventListener('keydown', onKey)

  const hot = (id: string): string => {
    if (id.startsWith('memory:')) return c.memory.find((m) => m.id === id.slice(7))?.title ?? ''
    const map: Record<string, string> = {
      diary: c.t.hotDiary,
      computer: c.t.hotComputer,
      voice: c.t.hotVoice,
      pet: c.t.hotPet,
      window: c.t.hotWindow,
      shelf: c.t.hotShelf,
      door: c.t.hotDoor,
      bell: c.t.hotBell,
    }
    return map[id] ?? id
  }
  const iconFor: Record<string, IconKey> = { diary: 'pen', computer: 'computer', voice: 'phone', pet: 'ghost', window: 'sun', shelf: 'book', door: 'door', bell: 'bell' }

  const view = new RoomView({
    container: stage,
    label: hot,
    icon: (id) => svgIcon(iconFor[id] ?? 'book', id.startsWith('memory:') ? 12 : 18),
    onPick: (id) => pick(id),
    hotspots: [],
    reduceMotion: reduce,
  })
  view.setData(c.home)
  view.setNight(night, true)
  view.showExterior(c.home.house, c.home.wall)
  void preloadModels().then(() => !disposed && view.setData(c.home))

  // ---- panels
  const entriesPanel = () =>
    openCard((box) => {
      box.append(el('h3', undefined, c.t.entries))
      if (!c.entries.length) return void box.append(el('p', undefined, c.t.noEntries))
      const ul = el('ul')
      for (const e of c.entries) {
        const li = el('li')
        const a = el('a', undefined, e.title)
        a.href = e.href
        const d = el('span', undefined, e.date)
        a.append(d)
        li.append(a)
        ul.append(li)
      }
      box.append(ul)
    }, c.t.entries)

  const welcomePanel = () => {
    const w = c.welcome
    if (!w) return
    view.focus('voice')
    openCard((box) => {
      box.append(el('h3', undefined, c.t.welcomeFrom))
      const secs = Math.max(1, Math.round(w.durationMs / 1000))
      box.append(el('p', undefined, `${w.title ? `${w.title} · ` : ''}${secs}s · ${fmt(c.t.recordedOn, { date: w.createdAt })}`))
      audio ??= new Audio()
      audio.preload = 'none'
      audio.src = w.src
      const btn = iconBtn('li-btn li-btn-primary', 'play', c.t.play)
      const sync = () => {
        btn.textContent = ''
        btn.insertAdjacentHTML('afterbegin', svgIcon(audio!.paused ? 'play' : 'pause', 18))
        btn.append(document.createTextNode(audio!.paused ? c.t.play : c.t.pause))
      }
      audio.onended = sync
      audio.onpause = sync
      audio.onplay = sync
      btn.addEventListener('click', () => {
        // The visitor presses play. Nothing ever autoplays.
        if (audio!.paused) void audio!.play().catch(() => undefined)
        else audio!.pause()
      })
      box.append(btn)
    }, c.t.welcomeFrom)
  }

  const petPanel = () => {
    view.pet.nudge()
    view.petState('react')
    view.focus('pet')
    openCard((box) => {
      box.append(el('h3', undefined, c.petName || c.t.hotPet))
      box.append(el('p', undefined, fmt(c.t.petHello, { name: c.petName || c.t.fallbackName })))
      const first = c.entries[0]
      if (first) {
        const a = el('a', 'li-btn', first.title)
        a.href = first.href
        box.append(a)
      }
    }, c.t.hotPet)
  }

  function pick(id: string) {
    if (id === 'bell') return ring()
    if (id === 'pet') return state === 'outside' ? view.pet.nudge() : petPanel()
    if (state !== 'inside') return
    if (id === 'voice') return welcomePanel()
    if (id === 'diary' || id === 'shelf') return entriesPanel()
    if (id === 'window') {
      night = !night
      view.setNight(night)
      return
    }
    if (id === 'computer') return close()
    if (id.startsWith('memory:')) {
      const m = c.memory.find((x) => x.id === id.slice(7))
      if (m) {
        close()
        location.href = m.href
      }
    }
  }

  // ---- intro
  let state: 'outside' | 'entering' | 'inside' = 'outside'
  const intro = el('div', 'li-intro')
  intro.append(el('small', undefined, c.t.someonesHome), el('h2', undefined, c.title))
  if (c.tagline) intro.append(el('p', undefined, c.tagline))
  const row = el('div', 'li-row')
  const ringBtn = iconBtn('li-btn li-btn-primary', 'bell', c.t.ring)
  const skipBtn = iconBtn('li-btn', null, c.t.skip)
  row.append(ringBtn, skipBtn)
  intro.append(row)
  root.append(intro)
  ringBtn.focus()
  skipBtn.addEventListener('click', close)
  siteBtn.addEventListener('click', close)
  ringBtn.addEventListener('click', ring)
  const hint = el('p', 'li-hint', c.t.drag)
  window.setTimeout(() => root.classList.remove('li-labels'), 8000)

  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, reduce ? 0 : ms))

  async function ring() {
    if (state !== 'outside') return
    state = 'entering'
    ringBtn.disabled = true
    chime()
    view.petState('react')
    await wait(700)
    view.openFrontDoor()
    intro.remove()
    await wait(900)
    view.flyTo(0.1, 1.45, 2.4, view.doorway)
    await wait(900)
    fade.classList.add('on')
    await wait(500)
    if (disposed) return
    view.enterHome(insideHotspots())
    stage.classList.toggle('is-night', night)
    root.append(hint)
    fade.classList.remove('on')
    state = 'inside'
    void probeGuestbook()
    if (c.welcome) {
      await wait(1600)
      if (!disposed && !card) welcomePanel()
    }
  }

  const insideHotspots = () => ['diary', 'shelf', 'pet', 'window', 'computer', ...(c.welcome ? ['voice'] : [])]

  // ---- guestbook (only on the platform copy; elsewhere the button never appears)
  async function probeGuestbook() {
    if (!c.slug || !location.pathname.startsWith(`/@${c.slug}/`)) return
    const api = `${location.origin}/api/sites/${c.slug}/messages`
    let approved: { name: string; text: string; createdAt: string }[]
    try {
      const r = await fetch(`${api}/approved`, { credentials: 'omit' })
      if (!r.ok) return
      approved = ((await r.json()) as { messages: typeof approved }).messages
    } catch {
      return
    }
    if (disposed) return
    const b = iconBtn('li-btn', 'mail', c.t.guestbook)
    actions.prepend(b)
    b.addEventListener('click', () =>
      openCard((box) => {
        box.append(el('h3', undefined, c.t.guestbook), el('p', undefined, c.t.guestHint))
        const list = el('div', 'li-msgs')
        for (const m of approved.slice(0, 30)) list.append(el('p', undefined, `${str(m.name, 40)}: ${str(m.text, 300)}`))
        box.append(list)
        const form = el('form', 'li-form')
        const name = el('input')
        name.maxLength = 40
        name.placeholder = c.t.yourName
        name.setAttribute('aria-label', c.t.yourName)
        const text = el('textarea')
        text.maxLength = 300
        text.placeholder = c.t.yourNote
        text.setAttribute('aria-label', c.t.yourNote)
        const trap = el('input', 'li-trap')
        trap.tabIndex = -1
        trap.autocomplete = 'off'
        trap.setAttribute('aria-hidden', 'true')
        const send = iconBtn('li-btn li-btn-primary', null, c.t.send)
        send.type = 'submit'
        const note = el('p', 'li-note')
        form.append(name, text, trap, send, note)
        form.addEventListener('submit', async (e) => {
          e.preventDefault()
          if (!text.value.trim()) return
          send.disabled = true
          try {
            const r = await fetch(api, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'omit',
              body: JSON.stringify({ name: name.value, text: text.value, website: trap.value }),
            })
            note.textContent = r.ok ? c.t.thanks : c.t.sendFail
            if (r.ok) text.value = ''
          } catch {
            note.textContent = c.t.sendFail
          }
          send.disabled = false
        })
        box.append(form)
      }, c.t.guestbook),
    )
  }

}

function run() {
  const el = document.getElementById('room-data')
  if (!el || !el.textContent) return
  let raw: unknown
  try {
    raw = JSON.parse(el.textContent)
  } catch {
    return
  }
  const c = clean(raw)
  if (!c) return
  if (!webglAvailable()) return // the page below is already a complete website
  start(c)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run)
else run()
