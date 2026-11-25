import {
  DEFAULT_LAYOUT,
  DEFAULT_STYLE,
  defaultSpan,
  STARTER_TOKENS,
  type DecorationAsset,
  type SiteDesign,
  type SitePage,
  type SiteWidget,
  type StickerId,
  type ThemeTokens,
  type WebsiteButton,
  type WidgetContent,
} from '../core/design.ts'
import { SPRITES } from '../core/pixels.ts'
import type { DecorKind, MemoryKind, Room } from '../core/room.ts'
import { parseProject, type Project } from '../core/schema.ts'
import { addAsset, addLink, addPost, compose, createProject, publishDraft, setPostObject, setVisibility, type Command } from '../editor/commands.ts'
import { encodePng, hex, mix, noise, pixelText, type Painter, type Rgba } from './png.ts'

/**
 * The three demo homes. They are ordinary Projects built with the same commands, design model,
 * generator and publishing API as any owner's home, so judges can open them in Web Atelier and
 * change everything. All text is written for Little Internet; all images are drawn here in code.
 * Every demo is marked `site.demo` and its owner is fictional.
 */

export const DEMO_IDS = ['the-book-nook', 'somewhere-by-the-sea', 'the-midnight-internet'] as const
export type DemoId = (typeof DEMO_IDS)[number]

export const DEMO_TITLES: Record<DemoId, string> = {
  'the-book-nook': 'The Book Nook',
  'somewhere-by-the-sea': 'Somewhere by the Sea',
  'the-midnight-internet': 'The Midnight Internet',
}

/** Each demo's 88×31 badge. Neighbours show each other's badges in their Cool links. */
const BUTTONS: Record<DemoId, WebsiteButton> = {
  'the-book-nook': { bg: '#f4efe4', bg2: '#7a2e22', pattern: 'solid', text: 'BOOK NOOK', text2: '', textColor: '#7a2e22', icon: 'book', border: 'bevel', borderColor: '#c0c0c0' },
  'somewhere-by-the-sea': { bg: '#8cc8f0', bg2: '#2f8fb0', pattern: 'gradient', text: 'BY THE', text2: 'SEA', textColor: '#ffffff', icon: 'shell', border: 'bevel', borderColor: '#c0c0c0' },
  'the-midnight-internet': { bg: '#05051f', bg2: '#3a1a6b', pattern: 'gradient', text: 'MIDNIGHT', text2: 'INTERNET', textColor: '#7dff6b', icon: 'moon', border: 'bevel', borderColor: '#c0c0c0' },
}

// ---------------------------------------------------------------------------- artwork

const W = 480
const H = 360

function seaPhoto(sky: [string, string], sea: string, sand: string, sun: [number, number, string], seed: number): Uint8Array {
  const top = hex(sky[0])
  const bottom = hex(sky[1])
  const water = hex(sea)
  const beach = hex(sand)
  const sunC = hex(sun[2])
  const horizon = H * 0.52
  const shore = H * 0.78
  return encodePng(W, H, (x, y) => {
    const n = noise(x, y, seed)
    if (y < horizon) {
      const d = Math.hypot(x - sun[0], y - sun[1])
      const base = mix(top, bottom, y / horizon)
      if (d < 26) return sunC
      return d < 70 ? mix(sunC, base, (d - 26) / 44) : base
    }
    const wave = Math.sin(x / 18 + y / 3 + seed) * 4
    if (y < shore + wave) {
      const shine = Math.abs(x - sun[0]) < 40 - (y - horizon) * 0.2 && n > 0.6 ? 0.45 : 0
      return mix(mix(water, hex('#ffffff'), shine), hex('#0b2a3a'), (y - horizon) / H * 0.6)
    }
    if (y < shore + wave + 5) return mix(hex('#ffffff'), beach, n * 0.4)
    return mix(beach, hex('#8a6a44'), n * 0.18 + (y - shore) / H * 0.3)
  })
}

function bookCover(color: string, band: string, seed: number): Uint8Array {
  const c = hex(color)
  const b = hex(band)
  return encodePng(240, 340, (x, y) => {
    const n = noise(x, y, seed) * 0.08
    if (x < 14) return mix(c, hex('#000000'), 0.35)
    if ((y > 60 && y < 70) || (y > 270 && y < 276)) return b
    if (y > 100 && y < 180 && x > 50 && x < 200) return mix(b, c, 0.25 + n)
    return mix(c, hex('#000000'), n)
  })
}

function nightPixel(seed: number): Uint8Array {
  const s = 4
  const w = 120
  const h = 90
  return encodePng(w * s, h * s, (px, py) => {
    const x = Math.floor(px / s)
    const y = Math.floor(py / s)
    const n = noise(x, y, seed)
    if (y > 64) return (x + y) % 2 ? hex('#1a0f2e') : hex('#24143d')
    const city = 64 - Math.floor(noise(Math.floor(x / 7), 0, seed) * 26)
    if (y > city) return n > 0.9 && y % 3 === 1 ? hex('#ffd36b') : hex('#0d0920')
    if (Math.hypot(x - 92, y - 18) < 9) return hex('#fff0a8')
    if (n > 0.985) return hex('#ffffff')
    return mix(hex('#0b0b3b'), hex('#5a2a6b'), y / 64)
  })
}

function pixelSprite(name: StickerId, scale: number): Uint8Array {
  const sp = SPRITES[name]
  return encodePng(16 * scale, 16 * scale, (x, y) => {
    const ch = sp.rows[Math.floor(y / scale)]?.[Math.floor(x / scale)] ?? '.'
    const c = sp.palette[ch]
    return c ? hex(c) : [0, 0, 0, 0]
  })
}

/** 88×31 badge, drawn pixel by pixel: two-colour background, bevel, optional sprite, pixel text. */
function badgePng(b: WebsiteButton): Uint8Array {
  const buf: Rgba[] = []
  const bg = hex(b.bg)
  const bg2 = hex(b.bg2)
  for (let y = 0; y < 31; y++) {
    for (let x = 0; x < 88; x++) {
      let c: Rgba
      if (b.pattern === 'gradient') c = mix(bg, bg2, x / 87)
      else if (b.pattern === 'stripes') c = (x + y) % 6 < 2 ? bg2 : bg
      else if (b.pattern === 'checker') c = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? bg2 : bg
      else if (b.pattern === 'dots') c = x % 4 === 1 && y % 4 === 1 ? bg2 : bg
      else c = bg
      buf.push(c)
    }
  }
  const set = (x: number, y: number, c: Rgba) => {
    if (x >= 0 && x < 88 && y >= 0 && y < 31) buf[y * 88 + x] = c
  }
  let left = 4
  if (b.icon !== 'none') {
    const sp = SPRITES[b.icon]
    sp.rows.forEach((row, y) => [...row].forEach((ch, x) => sp.palette[ch] && set(4 + x, 7 + y, hex(sp.palette[ch]!))))
    left = 22
  }
  const tc = hex(b.textColor)
  const lines = [b.text, b.text2].filter(Boolean)
  lines.forEach((line, i) => {
    const scale = lines.length === 1 && line.length * 8 <= 88 - left - 4 ? 2 : 1
    const width = line.length * 4 * scale - scale
    const ox = left + Math.max(0, Math.floor((88 - left - 3 - width) / 2))
    const oy = lines.length === 1 ? Math.floor((31 - 5 * scale) / 2) : i === 0 ? 8 : 18
    pixelText(line, scale, (x, y) => set(ox + x, oy + y, tc))
  })
  if (b.border === 'bevel') {
    for (let x = 0; x < 88; x++) {
      set(x, 0, hex('#ffffff'))
      set(x, 30, hex('#404040'))
    }
    for (let y = 0; y < 31; y++) {
      set(0, y, hex('#ffffff'))
      set(87, y, hex('#404040'))
    }
  }
  const paint: Painter = (x, y) => buf[y * 88 + x]!
  return encodePng(88, 31, paint)
}

// ---------------------------------------------------------------------------- building blocks

type PostSpec = {
  id: string
  date: string
  title: string
  body: string
  public: boolean
  photos?: Uint8Array[]
  keepsake?: MemoryKind
}

function withPosts(posts: PostSpec[]): Command {
  const cmds: Command[] = []
  for (const p of posts) {
    const ids = (p.photos ?? []).map((_, i) => `${p.id}-img${i}`)
    ;(p.photos ?? []).forEach((data, i) => cmds.push(addAsset({ id: ids[i]!, mime: 'image/png', data })))
    cmds.push(addPost({ id: p.id, createdAt: `${p.date}T09:00:00.000Z`, title: p.title, body: p.body, imageIds: ids }))
    if (p.public) cmds.push(setVisibility(p.id, 'public'))
    if (p.keepsake) cmds.push(setPostObject(p.id, p.keepsake, `${p.id}-obj`))
  }
  return compose(...cmds)
}

function makeWidgets(prefix: string) {
  let n = 0
  return (pageId: string, content: WidgetContent, layout: Partial<SiteWidget['layout']> = {}, style: Partial<SiteWidget['style']> = {}): SiteWidget => {
    const span = defaultSpan(content.type)
    return {
      id: `${prefix}${n}`,
      pageId,
      order: n++,
      hidden: false,
      layout: { ...DEFAULT_LAYOUT, span, mobile: span === 1 ? 'half' : 'full', ...layout },
      style: { ...DEFAULT_STYLE, ...style },
      content,
    }
  }
}

type Decoration = { id: string; kind: DecorationAsset['kind']; name: string; data: Uint8Array }

function finish(
  p0: Project,
  opts: {
    tokens: ThemeTokens
    style: SiteDesign['style']
    welcome: string
    pages: SitePage[]
    widgets: SiteWidget[]
    decorations: Decoration[]
    button: WebsiteButton
    room: Partial<Room> & { decor: { id: string; kind: DecorKind; x: number; z: number; rot: number }[] }
    links: { title: string; slug: DemoId }[]
    baseUrl: string
  },
): Project {
  let p = p0
  for (const d of opts.decorations) p = addAsset({ id: d.id, mime: 'image/png', data: d.data })(p)
  const btnId = `${p.site.slug.slice(0, 20)}-button`
  p = addAsset({ id: btnId, mime: 'image/png', data: badgePng(opts.button) })(p)
  const design: SiteDesign = {
    v: 1,
    style: opts.style,
    welcome: opts.welcome,
    tokens: opts.tokens,
    pages: opts.pages,
    widgets: opts.widgets,
    assets: [...opts.decorations.map(({ id, kind, name }) => ({ id, kind, name })), { id: btnId, kind: 'button', name: 'button.png' }],
    button: opts.button,
    buttonAssetId: btnId,
  }
  p = { ...p, web: { ...p.web, draft: design }, room: { ...p.room, ...opts.room } }
  for (const l of opts.links) {
    const badge = `badge-${l.slug}`
    p = addAsset({ id: badge, mime: 'image/png', data: badgePng(BUTTONS[l.slug]) })(p)
    p = addLink({ id: `link-${l.slug.slice(0, 30)}`, title: DEMO_TITLES[l.slug], url: `${opts.baseUrl}@${l.slug}/`, buttonAssetId: badge })(p)
  }
  p = publishDraft('2026-11-24T12:00:00.000Z')(p)
  const r = parseProject(p)
  if (!r.ok) throw new Error(`demo ${p.site.slug}: ${r.reason}`)
  return r.value
}

const others = (id: DemoId) => DEMO_IDS.filter((x) => x !== id).map((slug) => ({ title: DEMO_TITLES[slug], slug }))

// ---------------------------------------------------------------------------- 1. The Book Nook

function bookNook(baseUrl: string): Project {
  const slug: DemoId = 'the-book-nook'
  let p = createProject({ title: DEMO_TITLES[slug], slug, style: 'literary', ghostName: 'Page', ghostColor: 'peach' })
  p = { ...p, site: { ...p.site, tagline: 'Reading slowly, writing in the margins.', demo: true } }
  p = withPosts([
    { id: 'bn-p1', date: '2026-11-02', public: true, keepsake: 'book', title: 'On rereading Middlemarch', body: 'Third time through. At twenty I read it for the plot, at thirty for Dorothea, and now, I think, for the narrator, who forgives everyone a little more each chapter.\n\nA line I copied onto the inside of the cover: the growing good of the world is partly dependent on unhistoric acts.', photos: [bookCover('#7a2e22', '#e7c98b', 1)] },
    { id: 'bn-p2', date: '2026-11-09', public: true, keepsake: 'candle', title: 'A rainy Sunday and a short book', body: 'Rain all afternoon. I finished a slim novel in one sitting, which almost never happens any more. Tea went cold twice.\n\nThere is a particular quiet that comes after closing a book you loved. I tried not to fill it.' },
    { id: 'bn-p3', date: '2026-11-15', public: true, title: 'Reading notes: To the Lighthouse', body: 'Part two, “Time Passes”, is ten pages long and covers ten years. The house is the main character there. Dust, a shawl coming loose, the sea air getting in.\n\nI want to write a diary entry like that one day: nothing happens, and everything does.', photos: [bookCover('#2e4a5a', '#f2e6c8', 2)] },
    { id: 'bn-p4', date: '2026-11-20', public: true, keepsake: 'flower', title: 'Pressed flowers in an old atlas', body: 'Found a violet pressed between Portugal and Spain in a secondhand atlas. Someone, some spring, decided that page was the right place. I left it there.' },
    { id: 'bn-p5', date: '2026-11-22', public: false, title: 'A letter I am not sending', body: 'This one stays in the drawer.' },
  ])(p)
  const home = 'bn-home'
  const notes = 'bn-notes'
  const w = makeWidgets('bnw')
  const tokens: ThemeTokens = { ...STARTER_TOKENS.literary, bg: '#f4efe4', accent: '#7a2e22', link: '#7a2e22', titleSize: 46, width: 'normal' }
  const widgets = [
    w(home, { type: 'welcome', heading: 'Welcome to the nook', text: 'Pull a chair close to the lamp. This is where I keep the books I am reading, the lines I underline, and the small things that happen on the way to the end of a chapter.' }, { span: 2 }),
    w(home, { type: 'about', heading: 'About the reader', text: 'Librarian by day, slow reader by night. Fond of long Victorian novels, short Japanese ones, and anything with a map in the front.', assetId: 'bn-lamp' }, { span: 2 }),
    w(home, { type: 'divider', pattern: 'line' }, { span: 4 }),
    w(home, { type: 'diary', heading: 'From the notebook', mode: 'latest', postIds: [], count: 4, excerpts: true }, { span: 4 }),
    w(home, { type: 'bookshelf', heading: 'On the shelf this season', books: [
      { id: 'b1', title: 'Middlemarch', author: 'George Eliot', note: 'Third reread. Still finding new rooms in it.' },
      { id: 'b2', title: 'To the Lighthouse', author: 'Virginia Woolf', note: 'For “Time Passes” alone.' },
      { id: 'b3', title: 'The Pillow Book', author: 'Sei Shōnagon', note: 'Lists of things that quicken the heart.' },
      { id: 'b4', title: 'Walden', author: 'Henry David Thoreau', note: 'Read one chapter, then go for a walk.' },
    ] }, { span: 2 }),
    w(home, { type: 'memories', heading: 'Kept on the shelf at home' }, { span: 2 }),
    w(home, { type: 'divider', pattern: 'line' }, { span: 4 }),
    w(home, { type: 'guestbook', heading: 'Leave a note in the margin', intro: 'Tell me what you are reading. I read every note before it appears here.', open: true }, { span: 2 }),
    w(home, { type: 'links', heading: 'Neighbours', look: 'list' }, { span: 1, mobile: 'half' }),
    w(home, { type: 'webring', heading: 'Webring' }, { span: 1, mobile: 'half' }),
    w(home, { type: 'button', heading: 'Link to the nook' }, { span: 2 }),
    w(home, { type: 'boo', heading: '' }, { span: 2, align: 'center' }),
    w(notes, { type: 'text', heading: 'Reading notes', text: 'Longer notes on single books. Spoilers live here; you have been warned.' }, { span: 2 }),
    w(notes, { type: 'diary', heading: '', mode: 'pick', postIds: ['bn-p3', 'bn-p1'], count: 2, excerpts: true }, { span: 2 }),
  ]
  return finish(p, {
    tokens,
    style: 'literary',
    welcome: '',
    pages: [
      { id: home, slug: 'index', title: 'Home', nav: true, columns: 4 },
      { id: notes, slug: 'reading-notes', title: 'Reading notes', nav: true, columns: 2 },
    ],
    widgets,
    decorations: [{ id: 'bn-lamp', kind: 'image', name: 'lamp.png', data: bookCover('#3d5a40', '#e7c98b', 7) }],
    button: BUTTONS['the-book-nook'],
    room: { house: 'cabin', wall: 'sage', floor: 'walnut', light: 'auto', decor: [
      { id: 'bookcase-1', kind: 'bookcase', x: 5, z: 1, rot: 3 },
      { id: 'lamp-1', kind: 'floorlamp', x: 2, z: 1, rot: 0 },
      { id: 'chair-1', kind: 'armchair', x: 3, z: 2, rot: 1 },
      { id: 'plant-1', kind: 'plant', x: 0, z: 5, rot: 0 },
      { id: 'stool-1', kind: 'stool', x: 3, z: 4, rot: 0 },
    ] },
    links: others(slug),
    baseUrl,
  })
}

// ---------------------------------------------------------------------------- 2. Somewhere by the Sea

function bySea(baseUrl: string): Project {
  const slug: DemoId = 'somewhere-by-the-sea'
  let p = createProject({ title: DEMO_TITLES[slug], slug, style: 'scrapbook', ghostName: 'Kelp', ghostColor: 'mint' })
  p = { ...p, site: { ...p.site, tagline: 'Postcards from a slow year of small trips.', demo: true } }
  p = withPosts([
    { id: 'sea-p1', date: '2026-10-28', public: true, keepsake: 'shell', title: 'First swim of the trip', body: 'Cold enough to shout. Warm enough to stay in for ten minutes. Found a striped shell on the way back and carried it in my pocket all evening.', photos: [seaPhoto(['#8cc8f0', '#fbe2c0'], '#2f8fb0', '#e9d3a6', [360, 120, '#fff4c8'], 3)] },
    { id: 'sea-p2', date: '2026-11-03', public: true, keepsake: 'postcard', title: 'A postcard I wrote to myself', body: 'Bought a postcard of the harbour, wrote “remember the bakery on the corner” on it and mailed it home. It arrived before I did.', photos: [seaPhoto(['#f6a07a', '#ffd9a8'], '#3a6f9a', '#d9b98a', [120, 150, '#ffe7a0'], 5)] },
    { id: 'sea-p3', date: '2026-11-10', public: true, keepsake: 'photo', title: 'The lighthouse at dusk', body: 'We walked to the end of the pier just as the light came on. Two flashes, a pause, two flashes.', photos: [seaPhoto(['#2a2a5a', '#e98a7a'], '#24486a', '#b89a74', [240, 160, '#ffd27a'], 9)] },
    { id: 'sea-p4', date: '2026-11-18', public: true, title: 'Tide tables and toast', body: 'Breakfast by the window, reading the tide table like a timetable for the day. Low tide at 11:40 means rock pools.', photos: [seaPhoto(['#bfe3ff', '#e8f1ef'], '#4aa3b8', '#efdcb2', [420, 80, '#ffffff'], 11)] },
    { id: 'sea-p5', date: '2026-11-21', public: false, title: 'Money worries', body: 'Private note.' },
  ])(p)
  const home = 'sea-home'
  const w = makeWidgets('sew')
  const tokens: ThemeTokens = { ...STARTER_TOKENS.scrapbook, bg: '#e9dcc3', pattern: 'paper', patternColor: '#d4c09a', accent: '#2f7f9a', link: '#1f6f8a', headingFont: 'hand', titleSize: 48 }
  const widgets = [
    w(home, { type: 'welcome', heading: 'Hello from the coast!', text: 'This is my travel scrapbook: photos, tickets, shells and the notes I scribble on trains. Everything here is a small trip, nothing grand.' }, { span: 3, align: 'center' }, { look: 'letter', tilt: -1 }),
    w(home, { type: 'sticker', sticker: 'shell', assetId: 'sea-shell', size: 'l', motion: 'bob' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
    w(home, { type: 'gallery', heading: 'Photos from the road', source: 'posts', assetIds: [], count: 8 }, { span: 4 }, { look: 'polaroid', tilt: 1 }),
    w(home, { type: 'diary', heading: 'Travel notes', mode: 'latest', postIds: [], count: 3, excerpts: false }, { span: 2 }, { look: 'note', tilt: -2 }),
    w(home, { type: 'memories', heading: 'Things I brought home' }, { span: 2 }, { look: 'tape', tilt: 1 }),
    w(home, { type: 'sticker', sticker: 'camera', size: 'm', motion: 'none' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
    w(home, { type: 'text', heading: 'Next trip', text: 'Somewhere with a ferry. Maybe in March.' }, { span: 2 }, { look: 'note', tilt: 2 }),
    w(home, { type: 'sticker', sticker: 'flower', size: 'm', motion: 'bob' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
    w(home, { type: 'divider', pattern: 'flowers' }, { span: 4 }, { look: 'plain' }),
    w(home, { type: 'guestbook', heading: 'Send me a postcard', intro: 'Leave a note about a place you love. I read every one first.', open: true }, { span: 2 }, { look: 'letter' }),
    w(home, { type: 'links', heading: 'Friends along the coast', look: 'buttons' }, { span: 2 }, { tilt: -1 }),
    w(home, { type: 'webring', heading: 'Webring' }, { span: 2 }),
    w(home, { type: 'button', heading: 'Take my badge' }, { span: 2 }),
  ]
  return finish(p, {
    tokens,
    style: 'scrapbook',
    welcome: '',
    pages: [{ id: home, slug: 'index', title: 'Scrapbook', nav: true, columns: 4 }],
    widgets,
    decorations: [{ id: 'sea-shell', kind: 'sticker', name: 'shell.png', data: pixelSprite('shell', 8) }],
    button: BUTTONS['somewhere-by-the-sea'],
    room: { house: 'villa', wall: 'sky', floor: 'tile', light: 'day', decor: [
      { id: 'plant-1', kind: 'plant', x: 5, z: 1, rot: 0 },
      { id: 'basket-1', kind: 'basket', x: 3, z: 4, rot: 0 },
      { id: 'cactus-1', kind: 'cactus', x: 0, z: 5, rot: 0 },
      { id: 'chair-1', kind: 'armchair', x: 4, z: 5, rot: 2 },
    ] },
    links: others(slug),
    baseUrl,
  })
}

// ---------------------------------------------------------------------------- 3. The Midnight Internet

function midnight(baseUrl: string): Project {
  const slug: DemoId = 'the-midnight-internet'
  let p = createProject({ title: DEMO_TITLES[slug], slug, style: 'retro', ghostName: 'Byte', ghostColor: 'lilac' })
  p = { ...p, site: { ...p.site, tagline: '~ best viewed after midnight at 800×600 ~', demo: true } }
  p = withPosts([
    { id: 'mid-p1', date: '2026-10-31', public: true, keepsake: 'cassette', title: 'Mixtape #12: songs for debugging', body: 'Side A is for when it compiles. Side B is for when it does not. I recorded it off the radio, so there is a weather report in the middle of track four.' },
    { id: 'mid-p2', date: '2026-11-06', public: true, keepsake: 'ticket', title: 'I finished my tiny game!', body: 'It is a 2-minute platformer about a ghost delivering mail. 14 levels, one boss (a spam filter). Made over five weekends with a lot of tea.', photos: [nightPixel(4)] },
    { id: 'mid-p3', date: '2026-11-14', public: true, keepsake: 'candle', title: 'Why I hand-make my homepage', body: 'Every pixel on this page is mine. The star background, the spinning globe, the broken guestbook from 2006 that I rebuilt. A homepage is a room you can rearrange whenever you like.' },
    { id: 'mid-p4', date: '2026-11-23', public: false, title: 'Job interview nerves', body: 'Private.' },
  ])(p)
  const home = 'mid-home'
  const lab = 'mid-lab'
  const w = makeWidgets('miw')
  const tokens: ThemeTokens = { ...STARTER_TOKENS.retro, bg: '#05051f', pattern: 'stars', patternColor: '#9ff3ff', accent: '#ff5fd2', link: '#7dff6b', headingFont: 'impact', bodyFont: 'verdana', titleSize: 52 }
  const widgets = [
    w(home, { type: 'sticker', sticker: 'computer', size: 'l', motion: 'blink' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
    w(home, { type: 'welcome', heading: 'WELCOME 2 MY CORNER OF THE WEB', text: 'You are visitor number… just kidding, I do not count you. Grab a snack, sign the guestbook, and follow the webring when you get bored.' }, { span: 2, align: 'center' }),
    w(home, { type: 'sticker', sticker: 'globe', size: 'l', motion: 'spin' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
    w(home, { type: 'construction', text: 'Forever under construction' }, { span: 4 }, { look: 'plain' }),
    w(home, { type: 'divider', pattern: 'rainbow' }, { span: 4 }, { look: 'plain' }),
    w(home, { type: 'diary', heading: 'Latest transmissions', mode: 'latest', postIds: [], count: 3, excerpts: true }, { span: 2 }),
    w(home, { type: 'guestbook', heading: 'Sign my guestbook!!', intro: 'Be nice. I approve every message by hand, like it is 1999.', open: true }, { span: 2 }),
    w(home, { type: 'memories', heading: 'My desk drawer' }, { span: 2 }),
    w(home, { type: 'boo', heading: 'Byte says hi' }, { span: 2, align: 'center' }),
    w(home, { type: 'divider', pattern: 'stars' }, { span: 4 }, { look: 'plain' }),
    w(home, { type: 'links', heading: 'Cool sites', look: 'buttons' }, { span: 2 }),
    w(home, { type: 'webring', heading: 'Webring' }, { span: 1, mobile: 'half' }),
    w(home, { type: 'button', heading: 'Link 2 me!' }, { span: 1, mobile: 'half', align: 'center' }),
    w(lab, { type: 'text', heading: 'The lab', text: 'Experiments, half-finished games, and pixel doodles. Click nothing. Touch everything.' }, { span: 2 }),
    w(lab, { type: 'gallery', heading: 'Screenshots', source: 'uploads', assetIds: ['mid-sky'], count: 6 }, { span: 2 }),
    w(lab, { type: 'sticker', sticker: 'note', size: 'm', motion: 'bob' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
    w(lab, { type: 'construction', text: 'More soon' }, { span: 1, mobile: 'half' }, { look: 'plain' }),
  ]
  return finish(p, {
    tokens,
    style: 'retro',
    welcome: '*~* Thanks for visiting The Midnight Internet! New: my tiny game is out! *~*',
    pages: [
      { id: home, slug: 'index', title: 'Home', nav: true, columns: 4 },
      { id: lab, slug: 'lab', title: 'The lab', nav: true, columns: 2 },
    ],
    widgets,
    decorations: [{ id: 'mid-sky', kind: 'image', name: 'night-city.png', data: nightPixel(2) }],
    button: BUTTONS['the-midnight-internet'],
    room: { house: 'cabin', wall: 'plum', floor: 'checker', light: 'night', decor: [
      { id: 'lamp-1', kind: 'floorlamp', x: 2, z: 1, rot: 0 },
      { id: 'chair-1', kind: 'armchair', x: 3, z: 3, rot: 1 },
      { id: 'stool-1', kind: 'stool', x: 5, z: 4, rot: 0 },
      { id: 'cactus-1', kind: 'cactus', x: 5, z: 1, rot: 0 },
    ] },
    links: others(slug),
    baseUrl,
  })
}

/** Builds a demo home. `baseUrl` is the server root ending in "/" (used for neighbour links). */
export function buildDemo(id: DemoId, baseUrl: string): Project {
  switch (id) {
    case 'the-book-nook':
      return bookNook(baseUrl)
    case 'somewhere-by-the-sea':
      return bySea(baseUrl)
    case 'the-midnight-internet':
      return midnight(baseUrl)
  }
}

/**
 * A private sandbox copy for "Try a demo home": a different address (so it can never overwrite the
 * real demo site), not marked as a demo, and not published yet.
 */
export function demoCopy(id: DemoId, baseUrl: string): Project {
  const p = buildDemo(id, baseUrl)
  const { published: _p, ...web } = p.web
  const { demo: _d, ...site } = p.site
  return { ...p, site: { ...site, slug: `my-${id}`.slice(0, 32).replace(/-+$/, '') }, web }
}
