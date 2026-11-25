import fc from 'fast-check'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import ghostSource from '../src/runtime/ghost.js?raw'
import { jsonForScript } from '../src/core/escape.ts'
import type { Post } from '../src/core/schema.ts'
import { askMemories, onThisDay } from '../src/editor/memories.ts'
import { lineArb, NASTY, textArb } from './arbitraries.ts'

// ---------------------------------------------------------------- fake clock

function fakeClock(start: number) {
  let now = start
  let seq = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      timers.set(++seq, { at: now + ms, fn })
      return seq
    },
    clearTimeout: (id: number) => void timers.delete(id),
    advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
        if (!due) break
        timers.delete(due[0])
        now = due[1].at
        due[1].fn()
      }
      now = target
    },
  }
}

type GhostData = {
  enabled: boolean
  name: string
  color: string
  greeting: string
  guide: Array<{ label: string; href: string }>
  latest?: { title: string; href: string; createdAt: string }
}

function mount(data: unknown, opts: { home?: boolean; now?: number } = {}) {
  const dom = new JSDOM(
    `<!doctype html><body><main>${opts.home === false ? '' : '<section><div data-ghost-home></div></section>'}</main>` +
      `<script type="application/json" id="ghost-data">${data === undefined ? '' : jsonForScript(data)}</script></body>`,
    { runScripts: 'outside-only' },
  )
  const clock = fakeClock(opts.now ?? Date.parse('2026-11-23T12:00:00.000Z'))
  ;(dom.window as unknown as { __ghostClock: unknown }).__ghostClock = clock
  dom.window.eval(ghostSource)
  const doc = dom.window.document
  const root = doc.querySelector('.ghost-wrap')
  return {
    dom,
    doc,
    clock,
    root,
    state: () => root?.getAttribute('data-state'),
    click: (el: Element) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
    poke: () => doc.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })),
  }
}

const ALLOWED = new Set(['DIV', 'BUTTON', 'svg', 'path', 'g', 'circle', 'ellipse', 'text', 'P', 'UL', 'LI', 'A'])
const FIXED_TEXT = new Set(['z', 'Something new: ', 'a new entry'])

const hrefArb = fc.oneof(
  fc.constantFrom('posts/a.html', '../index.html#links', 'feed.xml', 'https://ring.example/random'),
  fc.constantFrom('javascript:alert(1)', 'data:text/html,<b>x</b>', ' JAVASCRIPT:x', 'java\tscript:x', '\u0001javascript:x', 'vbscript:x', 'https:javascript:x'),
  fc.string({ maxLength: 12 }),
)

const ghostDataArb: fc.Arbitrary<GhostData> = fc.record(
  {
    enabled: fc.constant(true),
    name: lineArb(24),
    color: fc.oneof(fc.constantFrom('white', 'mint', 'peach', 'lilac'), fc.constantFrom(...NASTY)),
    greeting: lineArb(200),
    guide: fc.array(fc.record({ label: lineArb(80), href: hrefArb }), { maxLength: 6 }),
    latest: fc.record({ title: lineArb(120), href: hrefArb, createdAt: fc.constant('2026-11-22T09:00:00.000Z') }),
  },
  { requiredKeys: ['enabled', 'name', 'color', 'greeting', 'guide'] },
)

describe('visitor ghost (ghost.js)', () => {
  // G1 — Requirement 2.1
  it('G1: data can never create markup, scripts or unsafe links', () => {
    fc.assert(
      fc.property(ghostDataArb, fc.boolean(), (data, home) => {
        const g = mount(data, { home })
        expect(g.root).not.toBeNull()
        g.click(g.doc.querySelector('.ghost')!) // open guide so every string is rendered
        const strings = new Set<string>([
          data.name,
          data.greeting,
          ...data.guide.map((x) => x.label),
          ...(data.latest ? [data.latest.title] : []),
          ...FIXED_TEXT,
        ])
        for (const el of g.root!.querySelectorAll('*')) {
          expect(ALLOWED.has(el.tagName), `unexpected <${el.tagName}>`).toBe(true)
          for (const attr of el.getAttributeNames()) expect(attr.startsWith('on'), attr).toBe(false)
          if (el.tagName === 'A') {
            // Resolve exactly as the browser would and require a web scheme.
            const resolved = new URL(el.getAttribute('href')!, 'https://site.example/@moon/index.html')
            expect(['https:', 'http:'], el.getAttribute('href')!).toContain(resolved.protocol)
          }
        }
        const walker = g.doc.createTreeWalker(g.root!, 4 /* SHOW_TEXT */)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          expect(strings.has(n.textContent!), `unexpected text ${JSON.stringify(n.textContent)}`).toBe(true)
        }
        expect(g.doc.querySelectorAll('script').length).toBe(1)
        expect(g.root!.querySelector('.ghost')!.className).toMatch(/^ghost ghost-(white|mint|peach|lilac)$/)
      }),
      { numRuns: 150 },
    )
  })

  // G2 — Requirement 1.2
  it('G2: the ghost sleeps only after 20 s without activity and wakes on any activity', () => {
    const step = fc.record({ wait: fc.integer({ min: 0, max: 30_000 }), act: fc.boolean() })
    fc.assert(
      fc.property(fc.array(step, { minLength: 5, maxLength: 40, size: 'max' }), (steps) => {
        const g = mount({ enabled: true, name: 'Boo', color: 'white', greeting: 'Hi', guide: [] })
        let sinceActivity = 0
        expect(g.state()).toBe('idle')
        for (const s of steps) {
          g.clock.advance(s.wait)
          sinceActivity += s.wait
          if (s.act) {
            g.poke()
            sinceActivity = 0
          }
          expect(g.state()).toBe(sinceActivity >= 20_000 ? 'sleep' : 'idle')
        }
      }),
      { numRuns: 200 },
    )
  })

  it('reacts to an entry from the last 7 days, then returns to idle', () => {
    const g = mount({
      enabled: true, name: 'Boo', color: 'white', greeting: 'Hi', guide: [],
      latest: { title: 'Sea', href: 'posts/sea.html', createdAt: '2026-11-20T10:00:00.000Z' },
    })
    expect(g.state()).toBe('react')
    expect(g.doc.querySelector('.ghost-bubble')!.textContent).toBe('Something new: Sea')
    g.clock.advance(4000)
    expect(g.state()).toBe('idle')
    expect((g.doc.querySelector('.ghost-bubble') as HTMLElement).hidden).toBe(true)
  })

  it('does not react to old entries', () => {
    const g = mount({
      enabled: true, name: 'Boo', color: 'white', greeting: 'Hi', guide: [],
      latest: { title: 'Old', href: 'posts/old.html', createdAt: '2026-10-01T10:00:00.000Z' },
    })
    expect(g.state()).toBe('idle')
  })

  it('guide opens on click, closes on Escape and on outside click', () => {
    const g = mount({ enabled: true, name: 'Boo', color: 'mint', greeting: 'Hi', guide: [{ label: 'Read', href: 'posts/a.html' }] })
    const btn = g.doc.querySelector('.ghost')!
    g.click(btn)
    expect(g.state()).toBe('guide')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    g.doc.dispatchEvent(new g.dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
    expect(g.state()).toBe('idle')
    g.click(btn)
    g.click(g.doc.querySelector('main')!)
    expect(g.state()).toBe('idle')
  })

  it.each([
    ['missing data', undefined],
    ['disabled', { enabled: false }],
    ['not an object', 'boo'],
  ])('stays out of the way with %s', (_label, data) => {
    const g = mount(data)
    expect(g.root).toBeNull()
  })

  it('floats in the corner when there is no ghost home', () => {
    const g = mount({ enabled: true, name: 'Boo', color: 'white', greeting: 'Hi', guide: [] }, { home: false })
    expect(g.root!.className).toContain('ghost-floating')
    expect(g.root!.parentElement!.tagName).toBe('BODY')
  })
})

// ---------------------------------------------------------------- memories

const postArb = (createdAt: fc.Arbitrary<string>): fc.Arbitrary<Post> =>
  fc.record({
    kind: fc.constant('diary' as const),
    tags: fc.constant([] as string[]),
    fields: fc.constant({} as Post['fields']),
    starred: fc.constant(false),
    id: fc.stringMatching(/^[a-z0-9]{1,8}$/),
    slug: fc.constant('x'),
    title: fc.oneof(lineArb(60), fc.constantFrom('海边的一天', 'Sand & SEA')),
    body: fc.oneof(textArb(400), fc.constantFrom('今天去了海边，沙子很暖。', 'cold water, warm SAND', 'İstanbul ǅ ß')),
    createdAt,
    visibility: fc.constantFrom('public' as const, 'private' as const),
    imageIds: fc.constant([]),
  })

const isoArb = fc
  .date({ min: new Date('2015-01-01T00:00:00Z'), max: new Date('2026-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString())

describe('owner memories', () => {
  // G3 — Requirements 3.3, 3.4
  it('G3: every answer contains the query and quotes only real text', () => {
    const queryArb = fc.oneof(fc.constantFrom('sand', '海边', 'SEA', 'i', 'ß', '暖'), lineArb(6))
    fc.assert(
      fc.property(fc.array(postArb(isoArb), { maxLength: 12 }), queryArb, (posts, query) => {
        const res = askMemories(posts, query)
        expect(res.length).toBeLessThanOrEqual(3)
        for (const { post, excerpt } of res) {
          expect(posts).toContain(post)
          const hay = `${post.body}\n${post.title}`.toLowerCase()
          expect(hay.includes(query.trim().toLowerCase())).toBe(true)
          expect(post.body.includes(excerpt) || post.title.includes(excerpt)).toBe(true)
        }
        if (!query.trim()) expect(res).toEqual([])
        // Newest first
        for (let i = 1; i < res.length; i++) expect(res[i - 1]!.post.createdAt >= res[i]!.post.createdAt).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  // G4 — Requirement 3.2
  it('G4: on this day returns same month/day from earlier years, newest first', () => {
    fc.assert(
      fc.property(fc.array(postArb(isoArb), { maxLength: 20 }), fc.date({ min: new Date('2016-01-01'), max: new Date('2027-01-01'), noInvalidDate: true }), (posts, today) => {
        const res = onThisDay(posts, today)
        for (const p of res) {
          const d = new Date(p.createdAt)
          expect(d.getMonth()).toBe(today.getMonth())
          expect(d.getDate()).toBe(today.getDate())
          expect(d.getFullYear()).toBeLessThan(today.getFullYear())
        }
        const expected = posts.filter((p) => {
          const d = new Date(p.createdAt)
          return d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() < today.getFullYear()
        })
        expect(res.length).toBe(expected.length)
        for (let i = 1; i < res.length; i++) expect(res[i - 1]!.createdAt >= res[i]!.createdAt).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('finds Chinese text and ignores case', () => {
    const posts = [
      { id: 'a', slug: 'a', title: '海边', body: '今天去了海边，沙子很暖。', createdAt: '2025-11-23T10:00:00.000Z', visibility: 'private' as const, imageIds: [], kind: 'diary' as const, tags: [], fields: {}, starred: false },
      { id: 'b', slug: 'b', title: 'Work', body: 'Deadline stress again.', createdAt: '2026-11-20T10:00:00.000Z', visibility: 'private' as const, imageIds: [], kind: 'diary' as const, tags: [], fields: {}, starred: false },
    ]
    expect(askMemories(posts, '沙子').map((m) => m.post.id)).toEqual(['a'])
    expect(askMemories(posts, 'STRESS')[0]!.excerpt).toContain('stress')
    expect(askMemories(posts, 'nothing like this')).toEqual([])
    expect(onThisDay(posts, new Date('2026-11-23T12:00:00.000Z')).map((p) => p.id)).toEqual(['a'])
  })
})
