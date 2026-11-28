import { z } from 'zod'
import { color, httpUrl, id, isoDate, line, text } from './validators.ts'

/**
 * Web Atelier: the owner's website design. Pure data and rules; no DOM.
 *
 *   SiteDesign      the whole design (a draft, or a published snapshot of a draft)
 *   SitePage        a page of the site; the first page is index.html
 *   SiteWidget      one component on a page: id, type, page, order, layout, style, content, visibility
 *   ThemeTokens     colours, fonts, background, borders, divider
 *   DecorationAsset an image the owner uploaded FOR the website (sticker, GIF, background, favicon, badge)
 *
 * Widgets never copy diary text. They point at content by id (postIds, the welcome recording, links,
 * memory objects) and the generator resolves those ids against the PUBLIC projection only.
 * Layout is a responsive column grid (span 1–4, mobile full/half/hidden); there is no free absolute
 * positioning, so nothing can overflow a phone screen.
 */

export const DESIGN_VERSION = 1

export const STYLES = ['retro', 'scrapbook', 'literary', 'blank'] as const
export type StyleId = (typeof STYLES)[number]

export const FONTS = ['times', 'serif', 'book', 'sans', 'rounded', 'mono', 'hand', 'comic', 'impact', 'verdana'] as const
export type FontId = (typeof FONTS)[number]

export const FONT_STACKS: Record<FontId, string> = {
  times: '"Times New Roman", Times, serif',
  serif: 'Georgia, "Times New Roman", serif',
  book: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "Songti SC", Georgia, serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", sans-serif',
  rounded: '"Trebuchet MS", "Avenir Next", Verdana, sans-serif',
  mono: '"Courier New", Courier, ui-monospace, monospace',
  hand: '"Bradley Hand", "Segoe Print", "Chalkboard SE", "Comic Sans MS", "Kaiti SC", cursive',
  comic: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive',
  impact: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
  verdana: 'Verdana, Tahoma, Geneva, sans-serif',
}

export const PATTERNS = ['none', 'stars', 'dots', 'grid', 'checker', 'stripes', 'hearts', 'paper', 'waves', 'sparkle'] as const
export type PatternId = (typeof PATTERNS)[number]

export const BORDERS = ['none', 'solid', 'dashed', 'double', 'ridge', 'window', 'pixel'] as const
export type BorderId = (typeof BORDERS)[number]

export const DIVIDERS = ['line', 'dots', 'stars', 'hearts', 'zigzag', 'flowers', 'rainbow'] as const
export type DividerId = (typeof DIVIDERS)[number]

export const LOOKS = ['panel', 'plain', 'note', 'polaroid', 'tape', 'window', 'letter'] as const
export type LookId = (typeof LOOKS)[number]

export const STICKERS = ['star', 'heart', 'ghost', 'flower', 'mail', 'computer', 'moon', 'shell', 'camera', 'book', 'note', 'sparkle', 'cone', 'globe'] as const
export type StickerId = (typeof STICKERS)[number]

export const BUTTON_ICONS = ['none', ...STICKERS] as const

export const WIDGET_TYPES = [
  'welcome',
  'about',
  'diary',
  'gallery',
  'bookshelf',
  'memories',
  'audio',
  'boo',
  'guestbook',
  'links',
  'webring',
  'button',
  'text',
  'image',
  'sticker',
  'divider',
  'construction',
] as const
export type WidgetType = (typeof WIDGET_TYPES)[number]

export const MAX_PAGES = 8
export const MAX_WIDGETS = 120
export const MAX_DECORATIONS = 60
export const PAGE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/

// ------------------------------------------------------------------ schemas

const heading = line(80)

export const WidgetContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), heading, text: text(600) }),
  z.object({ type: z.literal('about'), heading, text: text(1200), assetId: id.optional() }),
  z.object({
    type: z.literal('diary'),
    heading,
    mode: z.enum(['latest', 'pick']),
    postIds: z.array(id).max(20),
    count: z.number().int().min(1).max(12),
    excerpts: z.boolean(),
  }),
  z.object({
    type: z.literal('gallery'),
    heading,
    source: z.enum(['posts', 'uploads']),
    assetIds: z.array(id).max(24),
    count: z.number().int().min(1).max(24),
  }),
  z.object({
    type: z.literal('bookshelf'),
    heading,
    books: z.array(z.object({ id, title: line(120), author: line(80), note: line(200) })).max(40),
  }),
  z.object({ type: z.literal('memories'), heading }),
  z.object({ type: z.literal('audio'), heading, text: line(200) }),
  z.object({ type: z.literal('boo'), heading }),
  z.object({ type: z.literal('guestbook'), heading, intro: line(200), open: z.boolean() }),
  z.object({ type: z.literal('links'), heading, look: z.enum(['list', 'buttons']) }),
  z.object({ type: z.literal('webring'), heading }),
  z.object({ type: z.literal('button'), heading }),
  z.object({ type: z.literal('text'), heading, text: text(2000) }),
  z.object({ type: z.literal('image'), assetId: id.optional(), caption: line(200), href: httpUrl.optional() }),
  z.object({
    type: z.literal('sticker'),
    sticker: z.enum(STICKERS),
    assetId: id.optional(),
    size: z.enum(['s', 'm', 'l']),
    motion: z.enum(['none', 'bob', 'spin', 'blink']),
  }),
  z.object({ type: z.literal('divider'), pattern: z.enum(DIVIDERS) }),
  z.object({ type: z.literal('construction'), text: line(80) }),
])
export type WidgetContent = z.infer<typeof WidgetContentSchema>

export const WidgetLayoutSchema = z.object({
  /** Columns this widget spans on wide screens (clamped to the page's column count). */
  layer: z.number().int().min(0).max(20).optional(),
  canvasX:z.number().min(0).max(98).optional(),canvasY:z.number().min(0).max(5000).optional(),
  widthPct:z.number().min(8).max(100).optional(),heightPx:z.number().min(60).max(1800).optional(),
  angle:z.number().min(-180).max(180).optional(),group:z.string().max(30).optional(),
  offsetX: z.number().int().min(-80).max(80).optional(),
  offsetY: z.number().int().min(-80).max(80).optional(),
  span: z.number().int().min(1).max(4),
  /** On phones the page has two columns: full width, half width, or hidden. */
  mobile: z.enum(['full', 'half', 'hide']),
  desktop: z.enum(['show', 'hide']),
  align: z.enum(['left', 'center', 'right']),
})

export const WidgetStyleSchema = z.object({
  look: z.enum(['auto', ...LOOKS]),
  bg: color.optional(),
  fg: color.optional(),
  tilt: z.number().int().min(-3).max(3),
})

export const SiteWidgetSchema = z.object({
  id,
  pageId: id,
  order: z.number().int().min(0).max(10_000),
  /** Hidden widgets stay in the draft but are never published or exported. */
  hidden: z.boolean(),
  layout: WidgetLayoutSchema,
  style: WidgetStyleSchema,
  content: WidgetContentSchema,
})
export type SiteWidget = z.infer<typeof SiteWidgetSchema>

export const SitePageSchema = z.object({
  free:z.boolean().optional(),
  id,
  slug: z.string().regex(PAGE_SLUG_PATTERN),
  title: line(40),
  nav: z.boolean(),
  columns: z.number().int().min(1).max(4),
})
export type SitePage = z.infer<typeof SitePageSchema>

export const ThemeTokensSchema = z.object({
  bg: color,
  pattern: z.enum(PATTERNS),
  patternColor: color,
  bgAssetId: id.optional(),
  bgFit: z.enum(['tile', 'cover']),
  text: color,
  muted: color,
  accent: color,
  link: color,
  panel: color,
  panelText: color,
  headingFont: z.enum(FONTS),
  bodyFont: z.enum(FONTS),
  baseSize: z.number().int().min(13).max(20),
  border: z.enum(BORDERS),
  borderColor: color,
  borderWidth: z.number().int().min(0).max(8),
  radius: z.number().int().min(0).max(24),
  shadow: z.enum(['none', 'soft', 'hard']),
  look: z.enum(LOOKS),
  divider: z.enum(DIVIDERS),
  width: z.enum(['narrow', 'normal', 'wide']),
  headerAlign: z.enum(['left', 'center']),
  titleSize: z.number().int().min(18).max(64),
})
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>

export const DecorationAssetSchema = z.object({
  id,
  kind: z.enum(['image', 'sticker', 'background', 'favicon', 'button']),
  name: line(60),
})
export type DecorationAsset = z.infer<typeof DecorationAssetSchema>

export const WebsiteButtonSchema = z.object({
  bg: color,
  bg2: color,
  pattern: z.enum(['solid', 'gradient', 'stripes', 'checker', 'dots']),
  text: line(14),
  text2: line(14),
  textColor: color,
  icon: z.enum(BUTTON_ICONS),
  border: z.enum(['bevel', 'solid', 'none']),
  borderColor: color,
  /** An uploaded 88×31 image replaces the drawn one. */
  imageAssetId: id.optional(),
})
export type WebsiteButton = z.infer<typeof WebsiteButtonSchema>

export const SiteDesignSchema = z.object({
  v: z.literal(DESIGN_VERSION),
  style: z.enum(STYLES),
  welcome: line(200),
  faviconAssetId: id.optional(),
  tokens: ThemeTokensSchema,
  pages: z.array(SitePageSchema).min(1).max(MAX_PAGES),
  widgets: z.array(SiteWidgetSchema).max(MAX_WIDGETS),
  assets: z.array(DecorationAssetSchema).max(MAX_DECORATIONS),
  button: WebsiteButtonSchema,
  /** The rendered 88×31 PNG (drawn by the badge editor or uploaded). Exported as button.png. */
  buttonAssetId: id.optional(),
})
export type SiteDesign = z.infer<typeof SiteDesignSchema>

export const GuestNoteSchema = z.object({ name: line(40), text: line(300), createdAt: isoDate })
export type GuestNote = z.infer<typeof GuestNoteSchema>

export const WebStateSchema = z.object({
  draft: SiteDesignSchema,
  /** The design visitors see. Changing the draft never changes this until the owner publishes. */
  published: z.object({ design: SiteDesignSchema, at: isoDate }).optional(),
  /** Approved guestbook notes as of the last sync; shown in exports, which cannot reach the server. */
  guestbook: z.array(GuestNoteSchema).max(100),
})
export type WebState = z.infer<typeof WebStateSchema>

// ------------------------------------------------------------------ rules

/** All image asset ids a design points at (each must be one of design.assets). */
export function designAssetRefs(d: SiteDesign): string[] {
  const out: string[] = []
  if (d.tokens.bgAssetId) out.push(d.tokens.bgAssetId)
  if (d.faviconAssetId) out.push(d.faviconAssetId)
  if (d.buttonAssetId) out.push(d.buttonAssetId)
  if (d.button.imageAssetId) out.push(d.button.imageAssetId)
  for (const w of d.widgets) {
    const c = w.content
    if ((c.type === 'about' || c.type === 'image' || c.type === 'sticker') && c.assetId) out.push(c.assetId)
    if (c.type === 'gallery' && c.source === 'uploads') out.push(...c.assetIds)
  }
  return out
}

/** Structural problems that zod cannot express. `assetIds`/`postIds` are what exists in the project. */
export function designIssues(d: SiteDesign, known: { assetIds: Set<string>; postIds: Set<string> }): string[] {
  const issues: string[] = []
  const dup = (label: string, values: string[]) => {
    if (new Set(values).size !== values.length) issues.push(`duplicate ${label}`)
  }
  dup('page id', d.pages.map((p) => p.id))
  dup('page address', d.pages.map((p) => p.slug))
  dup('widget id', d.widgets.map((w) => w.id))
  dup('decoration id', d.assets.map((a) => a.id))
  const pages = new Set(d.pages.map((p) => p.id))
  const decorations = new Set(d.assets.map((a) => a.id))
  for (const a of d.assets) if (!known.assetIds.has(a.id)) issues.push(`decoration ${a.id} has no image`)
  for (const ref of designAssetRefs(d)) if (!decorations.has(ref)) issues.push(`design points to a missing decoration ${ref}`)
  for (const w of d.widgets) {
    if (!pages.has(w.pageId)) issues.push(`widget ${w.id} is on a missing page`)
    if (w.content.type === 'diary') {
      for (const pid of w.content.postIds) if (!known.postIds.has(pid)) issues.push(`widget ${w.id} points to a missing entry`)
    }
  }
  return issues
}

/** Widgets of a page in display order. */
export function pageWidgets(d: SiteDesign, pageId: string): SiteWidget[] {
  return d.widgets
    .filter((w) => w.pageId === pageId)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Renumbers orders 0..n-1 per page so ordering is canonical. */
export function renumber(widgets: SiteWidget[]): SiteWidget[] {
  const byPage = new Map<string, SiteWidget[]>()
  for (const w of widgets) byPage.set(w.pageId, [...(byPage.get(w.pageId) ?? []), w])
  const out: SiteWidget[] = []
  for (const list of byPage.values()) {
    list
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .forEach((w, i) => out.push(w.order === i ? w : { ...w, order: i }))
  }
  return out
}

/** Canonical form: pages keep their order (it is the nav order); widgets and decorations are sorted. */
export function normalizeDesign(d: SiteDesign): SiteDesign {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const pageIndex = new Map(d.pages.map((p, i) => [p.id, i]))
  return {
    ...d,
    widgets: renumber(d.widgets).sort(
      (a, b) => (pageIndex.get(a.pageId) ?? 0) - (pageIndex.get(b.pageId) ?? 0) || a.order - b.order,
    ),
    assets: [...d.assets].sort((a, b) => cmp(a.id, b.id)),
  }
}

export type PublicContext = {
  publicPostIds: Set<string>
}

/**
 * The part of a design that may be shown to visitors: no hidden widgets, no references to private
 * entries, and only decorations the remaining design actually uses.
 */
export function publicDesign(d: SiteDesign, ctx: PublicContext): SiteDesign {
  const widgets = d.widgets
    .filter((w) => !w.hidden)
    .map((w) => {
      const c = w.content
      if (c.type === 'diary') return { ...w, content: { ...c, postIds: c.postIds.filter((x) => ctx.publicPostIds.has(x)) } }
      return w
    })
  const kept = { ...d, widgets }
  const used = new Set(designAssetRefs(kept))
  return renumberDesign({ ...kept, assets: d.assets.filter((a) => used.has(a.id)) })
}

function renumberDesign(d: SiteDesign): SiteDesign {
  return { ...d, widgets: renumber(d.widgets) }
}

// ------------------------------------------------------------------ defaults and starter styles

export const DEFAULT_LAYOUT: SiteWidget['layout'] = { span: 4, mobile: 'full', desktop: 'show', align: 'left' }
export const DEFAULT_STYLE: SiteWidget['style'] = { look: 'auto', tilt: 0 }

export function defaultButton(title: string): WebsiteButton {
  const words = title.trim().split(/\s+/)
  const cut = (s: string) => {
    let out = ''
    for (const ch of s.toUpperCase().replace(/[\n\r\t\u2028\u2029]/g, ' ')) {
      if ((out + ch).length > 14) break
      out += ch
    }
    return out
  }
  return {
    bg: '#1d2a6b',
    bg2: '#6b2a8a',
    pattern: 'gradient',
    text: cut(words[0] ?? '') || 'MY SITE',
    text2: cut(words.slice(1).join(' ')),
    textColor: '#fff6c2',
    icon: 'star',
    border: 'bevel',
    borderColor: '#c0c0c0',
  }
}

export const STARTER_TOKENS: Record<StyleId, ThemeTokens> = {
  retro: {
    bg: '#0b0b3b',
    pattern: 'stars',
    patternColor: '#fff27a',
    bgFit: 'tile',
    text: '#f2f2f2',
    muted: '#b9b9e6',
    accent: '#ff5fd2',
    link: '#7dff6b',
    panel: '#c0c0c0',
    panelText: '#111111',
    headingFont: 'comic',
    bodyFont: 'times',
    baseSize: 16,
    border: 'window',
    borderColor: '#ffffff',
    borderWidth: 3,
    radius: 0,
    shadow: 'hard',
    look: 'window',
    divider: 'rainbow',
    width: 'normal',
    headerAlign: 'center',
    titleSize: 44,
  },
  scrapbook: {
    bg: '#efe2c8',
    pattern: 'paper',
    patternColor: '#d8c6a3',
    bgFit: 'tile',
    text: '#3a2c22',
    muted: '#86705c',
    accent: '#d0624a',
    link: '#a34a35',
    panel: '#fffaf0',
    panelText: '#3a2c22',
    headingFont: 'hand',
    bodyFont: 'serif',
    baseSize: 16,
    border: 'none',
    borderColor: '#cdb894',
    borderWidth: 0,
    radius: 3,
    shadow: 'soft',
    look: 'tape',
    divider: 'flowers',
    width: 'normal',
    headerAlign: 'center',
    titleSize: 42,
  },
  literary: {
    bg: '#f7f3ea',
    pattern: 'none',
    patternColor: '#e6dfcf',
    bgFit: 'tile',
    text: '#211d18',
    muted: '#6f675b',
    accent: '#7a2e22',
    link: '#7a2e22',
    panel: '#f7f3ea',
    panelText: '#211d18',
    headingFont: 'book',
    bodyFont: 'book',
    baseSize: 18,
    border: 'none',
    borderColor: '#d8cfbd',
    borderWidth: 0,
    radius: 0,
    shadow: 'none',
    look: 'plain',
    divider: 'line',
    width: 'narrow',
    headerAlign: 'left',
    titleSize: 40,
  },
  blank: {
    bg: '#ffffff',
    pattern: 'none',
    patternColor: '#eeeeee',
    bgFit: 'tile',
    text: '#1f1f1f',
    muted: '#6b6b6b',
    accent: '#2f6fdf',
    link: '#2f6fdf',
    panel: '#ffffff',
    panelText: '#1f1f1f',
    headingFont: 'sans',
    bodyFont: 'sans',
    baseSize: 16,
    border: 'solid',
    borderColor: '#e2e2e2',
    borderWidth: 1,
    radius: 8,
    shadow: 'none',
    look: 'panel',
    divider: 'line',
    width: 'normal',
    headerAlign: 'left',
    titleSize: 32,
  },
}

type Strings = {
  home: string
  welcome: string
  welcomeText: string
  about: string
  aboutText: string
  diary: string
  photos: string
  books: string
  memories: string
  voice: string
  voiceText: string
  boo: string
  guestbook: string
  guestbookIntro: string
  links: string
  webring: string
  button: string
  construction: string
  note: string
}

export const STARTER_STRINGS: Record<'en' | 'zh', Strings> = {
  en: {
    home: 'Home',
    welcome: 'Welcome to my little corner!',
    welcomeText: 'Pull up a chair. This page is hand-made and always a little unfinished.',
    about: 'About me',
    aboutText: 'A few words about who lives here.',
    diary: 'Diary',
    photos: 'Photos',
    books: 'On my bookshelf',
    memories: 'Things I keep',
    voice: 'A message from me',
    voiceText: 'Press play to hear me say hello.',
    boo: 'Say hi to my ghost',
    guestbook: 'Sign my guestbook',
    guestbookIntro: 'Leave a note. I read every one before it appears here.',
    links: 'Cool links',
    webring: 'Webring',
    button: 'Link to me!',
    construction: 'This page is under construction',
    note: 'Notes',
  },
  zh: {
    home: '首页',
    welcome: '欢迎来到我的小角落！',
    welcomeText: '随便坐。这个页面是手工做的，永远有一点没完工。',
    about: '关于我',
    aboutText: '住在这里的人，说几句自己。',
    diary: '日记',
    photos: '照片',
    books: '我的书架',
    memories: '我收着的东西',
    voice: '给你的留言',
    voiceText: '点一下播放，听我打个招呼。',
    boo: '和我的小幽灵打招呼',
    guestbook: '留言簿',
    guestbookIntro: '留下一句话吧。每条留言我都会先读过，再公开。',
    links: '友情链接',
    webring: '网站环',
    button: '链接到我！',
    construction: '本页施工中',
    note: '便签',
  },
}

type Draft = Omit<SiteWidget, 'id' | 'pageId' | 'order' | 'hidden'> & { hidden?: boolean }

const W = (content: WidgetContent, layout: Partial<SiteWidget['layout']> = {}, style: Partial<SiteWidget['style']> = {}): Draft => ({
  layout: { ...DEFAULT_LAYOUT, ...layout },
  style: { ...DEFAULT_STYLE, ...style },
  content,
})

/** Default content for a new widget of a type. */
export function newWidgetContent(type: WidgetType, lang: 'en' | 'zh'): WidgetContent {
  const s = STARTER_STRINGS[lang]
  switch (type) {
    case 'welcome':
      return { type, heading: s.welcome, text: s.welcomeText }
    case 'about':
      return { type, heading: s.about, text: s.aboutText }
    case 'diary':
      return { type, heading: s.diary, mode: 'latest', postIds: [], count: 5, excerpts: true }
    case 'gallery':
      return { type, heading: s.photos, source: 'posts', assetIds: [], count: 8 }
    case 'bookshelf':
      return { type, heading: s.books, books: [] }
    case 'memories':
      return { type, heading: s.memories }
    case 'audio':
      return { type, heading: s.voice, text: s.voiceText }
    case 'boo':
      return { type, heading: s.boo }
    case 'guestbook':
      return { type, heading: s.guestbook, intro: s.guestbookIntro, open: true }
    case 'links':
      return { type, heading: s.links, look: 'buttons' }
    case 'webring':
      return { type, heading: s.webring }
    case 'button':
      return { type, heading: s.button }
    case 'text':
      return { type, heading: s.note, text: '' }
    case 'image':
      return { type, caption: '' }
    case 'sticker':
      return { type, sticker: 'star', size: 'm', motion: 'none' }
    case 'divider':
      return { type, pattern: 'stars' }
    case 'construction':
      return { type, text: s.construction }
  }
}

/** Width a new widget of this type gets (out of 4 columns). */
export function defaultSpan(type: WidgetType): number {
  switch (type) {
    case 'welcome':
    case 'diary':
    case 'gallery':
    case 'divider':
    case 'guestbook':
      return 4
    case 'sticker':
    case 'button':
    case 'construction':
      return 1
    default:
      return 2
  }
}

function starterDrafts(style: StyleId, lang: 'en' | 'zh'): Draft[] {
  const c = (t: WidgetType) => newWidgetContent(t, lang)
  switch (style) {
    case 'retro':
      return [
        W({ type: 'sticker', sticker: 'globe', size: 'm', motion: 'spin' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
        W(c('welcome'), { span: 2, mobile: 'full', align: 'center' }),
        W({ type: 'construction', text: STARTER_STRINGS[lang].construction }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
        W({ type: 'divider', pattern: 'rainbow' }, { span: 4 }, { look: 'plain' }),
        W(c('diary'), { span: 2 }),
        W(c('guestbook'), { span: 2 }),
        W(c('audio'), { span: 2 }),
        W(c('boo'), { span: 2, align: 'center' }),
        W({ type: 'divider', pattern: 'stars' }, { span: 4 }, { look: 'plain' }),
        W(c('links'), { span: 2 }),
        W(c('webring'), { span: 1, mobile: 'half' }),
        W(c('button'), { span: 1, mobile: 'half', align: 'center' }),
      ]
    case 'scrapbook':
      return [
        W(c('welcome'), { span: 4, align: 'center' }, { look: 'letter', tilt: -1 }),
        W(c('gallery'), { span: 4 }, { look: 'plain' }),
        W({ type: 'sticker', sticker: 'flower', size: 'm', motion: 'bob' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
        W(c('diary'), { span: 2 }, { look: 'note', tilt: 1 }),
        W({ type: 'sticker', sticker: 'shell', size: 'm', motion: 'none' }, { span: 1, mobile: 'half', align: 'center' }, { look: 'plain' }),
        W(c('memories'), { span: 2 }, { tilt: -1 }),
        W(c('audio'), { span: 2 }, { look: 'note', tilt: 2 }),
        W({ type: 'divider', pattern: 'flowers' }, { span: 4 }, { look: 'plain' }),
        W(c('guestbook'), { span: 2 }, { look: 'letter' }),
        W(c('links'), { span: 2 }, { tilt: 1 }),
      ]
    case 'literary':
      return [
        W(c('welcome'), { span: 4 }),
        W({ type: 'divider', pattern: 'line' }, { span: 4 }),
        W({ ...newWidgetContent('diary', lang), count: 8 } as WidgetContent, { span: 4 }),
        W(c('bookshelf'), { span: 4 }),
        W(c('about'), { span: 4 }),
        W({ type: 'divider', pattern: 'line' }, { span: 4 }),
        W({ ...newWidgetContent('links', lang), look: 'list' } as WidgetContent, { span: 2 }),
        W(c('guestbook'), { span: 2 }),
      ]
    case 'blank':
      return [W(c('welcome'), { span: 4 })]
  }
}

/** Widgets of a starter style on one page, with ids from `newId`. */
export function starterWidgets(style: StyleId, lang: 'en' | 'zh', pageId: string, newId: (i: number) => string): SiteWidget[] {
  return starterDrafts(style, lang).map((d, i) => ({ hidden: false, ...d, id: newId(i), pageId, order: i }))
}

/** A complete new design for a site. */
export function starterDesign(style: StyleId, site: { title: string; lang: 'en' | 'zh' }): SiteDesign {
  const pageId = 'home'
  return {
    v: DESIGN_VERSION,
    style,
    welcome: '',
    tokens: { ...STARTER_TOKENS[style] },
    pages: [{ id: pageId, slug: 'index', title: STARTER_STRINGS[site.lang].home, nav: true, columns: style === 'literary' ? 2 : 4 }],
    widgets: starterWidgets(style, site.lang, pageId, (i) => `w${i}`),
    assets: [],
    button: defaultButton(site.title),
  }
}

// ------------------------------------------------------------------ migration from the v1 block grid

type LegacyBlock = { id: string; x: number; y: number; w: number; h: number; content: { kind: string; postId?: string; assetId?: string; text?: string } }

const LEGACY_THEME_STYLE: Record<string, StyleId> = { paper: 'literary', midnight: 'retro', room: 'scrapbook', meadow: 'scrapbook' }

/**
 * Builds a design from a schemaVersion 1 project: each grid block becomes a widget in reading order,
 * the theme becomes the closest starter style. Image blocks become decorations (they were already
 * public by placement).
 */
export function designFromLegacy(input: {
  theme?: unknown
  title: string
  lang: 'en' | 'zh'
  blocks: LegacyBlock[]
  /** asset id → id of a post that shows it. Such photos stay tied to their entry's privacy. */
  postPhotos?: Map<string, string>
}): SiteDesign {
  const style = LEGACY_THEME_STYLE[String(input.theme)] ?? 'scrapbook'
  const s = STARTER_STRINGS[input.lang]
  const base = starterDesign(style, input)
  const blocks = [...input.blocks].sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1))
  const assets: DecorationAsset[] = []
  const widgets: SiteWidget[] = []
  blocks.forEach((b, i) => {
    let content: WidgetContent | undefined
    const k = b.content
    switch (k.kind) {
      case 'post':
        content = { type: 'diary', heading: '', mode: 'pick', postIds: k.postId ? [k.postId] : [], count: 1, excerpts: true }
        break
      case 'latest':
        content = { type: 'diary', heading: s.diary, mode: 'latest', postIds: [], count: 5, excerpts: false }
        break
      case 'image':
        if (k.assetId && input.postPhotos?.has(k.assetId)) {
          // A diary photo is shown through its entry, so it disappears if the entry is private.
          content = { type: 'diary', heading: '', mode: 'pick', postIds: [input.postPhotos.get(k.assetId)!], count: 1, excerpts: true }
        } else if (k.assetId) {
          if (!assets.some((a) => a.id === k.assetId)) assets.push({ id: k.assetId, kind: 'image', name: 'Photo' })
          content = { type: 'image', assetId: k.assetId, caption: '' }
        }
        break
      case 'text':
        content = { type: 'text', heading: '', text: k.text ?? '' }
        break
      case 'links':
        content = { type: 'links', heading: s.links, look: 'list' }
        break
      case 'ghost-home':
        content = { type: 'boo', heading: '' }
        break
      case 'voice':
        content = { type: 'audio', heading: s.voice, text: '' }
        break
    }
    if (!content) return
    widgets.push({
      id: b.id,
      pageId: 'home',
      order: i,
      hidden: false,
      layout: { ...DEFAULT_LAYOUT, span: Math.min(4, Math.max(1, b.w)), mobile: b.w >= 2 ? 'full' : 'half' },
      style: { ...DEFAULT_STYLE },
      content,
    })
  })
  return { ...base, widgets: renumber(widgets), assets }
}
