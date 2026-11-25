import { z } from 'zod'
import { SPRITES, spriteRects } from './pixels.ts'
import { drawingGroup, DrawingSchema } from './strokes.ts'
import { color, isSafeLine, isSafeText } from './validators.ts'

/**
 * Letter Atelier model. A letter is a paper with free-placed items: text, pixel stickers, stamps, a wax seal,
 * tape, flowers, a photo, a drawing (mouse, touch or Air Drawing) and an optional short voice note.
 * It needs no drawing skill: a letter may be a single heart, a flower, a photo or a sound.
 * Pure data and a pure SVG renderer, so the editor, the recipient's room and a website show the same thing.
 */

export const PAPER_W = 1000
export const PAPER_H = 1300
export const MAX_ITEMS = 40
export const MAX_PHOTO_CHARS = 180_000 // base64 chars of one jpeg/png (about 135 KB)
export const MAX_VOICE_CHARS = 260_000 // base64 chars (about 190 KB, a short message)
export const MAX_LETTER_JSON = 700_000

export const PAPERS = ['cream', 'lined', 'kraft', 'floral', 'night', 'blank'] as const
export type PaperId = (typeof PAPERS)[number]
export const FONTS = ['hand', 'serif', 'typewriter'] as const
export type LetterFont = (typeof FONTS)[number]
export const FONT_STACK: Record<LetterFont, string> = {
  hand: '"Bradley Hand","Segoe Print","Chalkboard SE","Comic Sans MS","Kaiti SC",cursive',
  serif: 'Georgia,"Times New Roman","Songti SC",serif',
  typewriter: '"Courier New",Courier,monospace',
}

export const STAMPS = ['postmark', 'heart', 'star', 'moon', 'ghost'] as const
export const STICKER_NAMES = ['star', 'heart', 'ghost', 'flower', 'mail', 'computer', 'moon', 'shell', 'camera', 'book', 'note', 'sparkle', 'globe'] as const
export const TAPES = ['#ffe29a', '#f9b4c4', '#a9d6f5', '#b8e0b0'] as const

const pos = { x: z.number().min(-100).max(1100), y: z.number().min(-100).max(1400), rot: z.number().min(-180).max(180), scale: z.number().min(0.3).max(4) }
const item = <T extends z.ZodRawShape>(shape: T) => z.object({ id: z.string().regex(/^[a-z0-9_-]{1,24}$/), ...pos, ...shape })
const dataUrl = (maxChars: number, prefixes: readonly string[]) =>
  z
    .string()
    .max(maxChars)
    .refine((s) => prefixes.some((p) => s.startsWith(p)) && /^[A-Za-z0-9+/=]+$/.test(s.slice(s.indexOf(',') + 1)), 'not a safe data URL')

export const LetterItemSchema = z.discriminatedUnion('t', [
  item({ t: z.literal('text'), text: z.string().max(400).refine(isSafeText), font: z.enum(FONTS), color, size: z.number().min(18).max(90) }),
  item({ t: z.literal('sticker'), name: z.enum(STICKER_NAMES) }),
  item({ t: z.literal('stamp'), name: z.enum(STAMPS), label: z.string().max(20).refine(isSafeLine).optional() }),
  item({ t: z.literal('seal'), color }),
  item({ t: z.literal('tape'), color }),
  item({ t: z.literal('photo'), data: dataUrl(MAX_PHOTO_CHARS, ['data:image/jpeg;base64,', 'data:image/png;base64,']), frame: z.boolean() }),
  item({ t: z.literal('drawing'), drawing: DrawingSchema }),
])
export type LetterItem = z.infer<typeof LetterItemSchema>

export const LetterSchema = z.object({
  v: z.literal(1),
  paper: z.enum(PAPERS),
  items: z.array(LetterItemSchema).max(MAX_ITEMS),
  /** Optional short voice note, played only when the recipient presses play. */
  voice: z.object({ mime: z.enum(['audio/webm', 'audio/mp4', 'audio/ogg']), data: dataUrl(MAX_VOICE_CHARS, ['data:audio/webm;base64,', 'data:audio/mp4;base64,', 'data:audio/ogg;base64,']), ms: z.number().int().min(100).max(30_000) }).optional(),
  /** Written date shown on the paper; free text such as "24 Nov". */
  date: z.string().max(24).refine(isSafeLine).optional(),
})
export type Letter = z.infer<typeof LetterSchema>

export const BLANK_LETTER: Letter = { v: 1, paper: 'cream', items: [] }

/** A letter must contain something: at least one item or a voice note. Sending nothing is not a gift. */
export function letterIsEmpty(l: Letter): boolean {
  return l.items.length === 0 && !l.voice
}

export function letterJsonSize(l: Letter): number {
  return JSON.stringify(l).length
}

// ------------------------------------------------------------------ editing (pure)

let n = 0
export const newItemId = () => `i${Date.now().toString(36)}${(n++).toString(36)}`.slice(0, 24)

export const addItem = (l: Letter, it: LetterItem): Letter => (l.items.length >= MAX_ITEMS ? l : { ...l, items: [...l.items, it] })
export const updateItem = (l: Letter, id: string, patch: Partial<Pick<LetterItem, 'x' | 'y' | 'rot' | 'scale'>> & Record<string, unknown>): Letter => ({
  ...l,
  items: l.items.map((i) => (i.id === id ? ({ ...i, ...patch } as LetterItem) : i)),
})
export const removeItem = (l: Letter, id: string): Letter => ({ ...l, items: l.items.filter((i) => i.id !== id) })
/** Moves an item up (+1) or down (-1) in the stacking order. */
export function restack(l: Letter, id: string, delta: 1 | -1): Letter {
  const i = l.items.findIndex((x) => x.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= l.items.length) return l
  const items = [...l.items]
  ;[items[i], items[j]] = [items[j]!, items[i]!]
  return { ...l, items }
}

/** Plain text of a letter (for search in the Life Archive and for screen readers). */
export function letterText(l: Letter): string {
  return l.items
    .filter((i): i is Extract<LetterItem, { t: 'text' }> => i.t === 'text')
    .map((i) => i.text.trim())
    .filter(Boolean)
    .join('\n')
}

// ------------------------------------------------------------------ SVG rendering

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function paperSvg(p: PaperId): string {
  const W = PAPER_W
  const H = PAPER_H
  switch (p) {
    case 'cream':
      return `<rect width="${W}" height="${H}" fill="#fbf1dc"/><rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#e5cfa4" stroke-width="3" stroke-dasharray="14 10"/>`
    case 'lined': {
      let lines = ''
      for (let y = 170; y < H - 60; y += 64) lines += `<line x1="70" y1="${y}" x2="${W - 70}" y2="${y}" stroke="#c9d8e6" stroke-width="3"/>`
      return `<rect width="${W}" height="${H}" fill="#fffdf6"/>${lines}<line x1="130" y1="0" x2="130" y2="${H}" stroke="#f0a6a6" stroke-width="3"/>`
    }
    case 'kraft':
      return `<rect width="${W}" height="${H}" fill="#cfa974"/><rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="#a98150" stroke-width="3"/>`
    case 'floral': {
      let f = ''
      const spots: [number, number, number][] = [[90, 90, 1], [910, 120, 0.8], [120, 1180, 0.9], [880, 1210, 1.1], [500, 60, 0.6], [60, 640, 0.7], [945, 700, 0.7]]
      for (const [x, y, s] of spots) f += `<g transform="translate(${x - 40 * s} ${y - 40 * s}) scale(${(s * 5).toFixed(2)})">${spriteRects('flower')}</g>`
      return `<rect width="${W}" height="${H}" fill="#fff4f2"/>${f}`
    }
    case 'night': {
      let st = ''
      for (let i = 0; i < 60; i++) st += `<circle cx="${(i * 193) % W}" cy="${(i * 331) % H}" r="${1.5 + (i % 3)}" fill="#fff6c2" opacity="${0.4 + (i % 5) / 8}"/>`
      return `<rect width="${W}" height="${H}" fill="#181a4a"/>${st}`
    }
    case 'blank':
      return `<rect width="${W}" height="${H}" fill="#ffffff"/>`
  }
}

function stampSvg(name: (typeof STAMPS)[number], label: string | undefined): string {
  const frame = `<rect x="-60" y="-70" width="120" height="140" fill="#fff9ee" stroke="#c9b48a" stroke-width="3" stroke-dasharray="6 4"/>`
  if (name === 'postmark') {
    return `<g>${frame}<circle cx="0" cy="0" r="46" fill="none" stroke="#7b5a3c" stroke-width="4"/><circle cx="0" cy="0" r="34" fill="none" stroke="#7b5a3c" stroke-width="2"/><text x="0" y="6" font-size="17" text-anchor="middle" fill="#7b5a3c" font-family="Georgia,serif">${esc(label ?? 'LITTLE')}</text><path d="M-40 54h80M-34 62h68" stroke="#7b5a3c" stroke-width="2"/></g>`
  }
  const spr = name === 'heart' ? 'heart' : name === 'star' ? 'star' : name === 'moon' ? 'moon' : 'ghost'
  return `<g>${frame}<g transform="translate(-44 -44) scale(5.5)">${spriteRects(spr)}</g></g>`
}

function itemSvg(it: LetterItem): string {
  const tf = `translate(${it.x} ${it.y}) rotate(${it.rot}) scale(${it.scale})`
  switch (it.t) {
    case 'text': {
      const lines = it.text.replace(/\r\n?/g, '\n').split('\n').slice(0, 12)
      const dy = it.size * 1.25
      const tspans = lines.map((ln, i) => `<tspan x="0" dy="${i === 0 ? 0 : dy}">${esc(ln) || ' '}</tspan>`).join('')
      return `<g transform="${tf}"><text font-size="${it.size}" font-family='${FONT_STACK[it.font].replace(/'/g, '')}' fill="${it.color}" xml:space="preserve">${tspans}</text></g>`
    }
    case 'sticker':
      return `<g transform="${tf}"><g transform="translate(-64 -64) scale(8)" shape-rendering="crispEdges">${spriteRects(it.name in SPRITES ? (it.name as keyof typeof SPRITES) : 'star')}</g></g>`
    case 'stamp':
      return `<g transform="${tf}">${stampSvg(it.name, it.label)}</g>`
    case 'seal':
      return `<g transform="${tf}"><circle r="62" fill="${it.color}"/><circle r="48" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="5"/><g transform="translate(-26 -26) scale(3.3)" opacity="0.55">${spriteRects('heart')}</g></g>`
    case 'tape':
      return `<g transform="${tf}"><rect x="-90" y="-24" width="180" height="48" fill="${it.color}" opacity="0.78"/><path d="M-90 -24l8 6-8 6 8 6-8 6M90 -24l-8 6 8 6-8 6 8 6" stroke="rgba(0,0,0,0.08)" fill="none"/></g>`
    case 'photo':
      return `<g transform="${tf}">${it.frame ? `<rect x="-190" y="-170" width="380" height="380" fill="#fffdf8" stroke="#e3d8c0" stroke-width="2"/>` : ''}<image href="${it.data}" x="-170" y="-150" width="340" height="300" preserveAspectRatio="xMidYMid slice"/></g>`
    case 'drawing':
      return `<g transform="${tf}"><g transform="translate(-500 -500)">${drawingGroup(it.drawing)}</g></g>`
  }
}

/** Full SVG of the letter. Every interpolated value is an escaped string, a validated colour/data URL or a number. */
export function letterToSvg(l: Letter, opts: { width?: number } = {}): string {
  const w = opts.width ?? 560
  const h = Math.round((w * PAPER_H) / PAPER_W)
  const date = l.date ? `<text x="${PAPER_W - 80}" y="96" font-size="34" text-anchor="end" font-family='${FONT_STACK.hand.replace(/'/g, '')}' fill="${l.paper === 'night' ? '#e8e0b0' : '#7b5a3c'}">${esc(l.date)}</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${PAPER_W} ${PAPER_H}" width="${w}" height="${h}">${paperSvg(l.paper)}${date}${l.items.map(itemSvg).join('')}</svg>`
}

/** Short description for lists and for screen readers. */
export function letterSummary(l: Letter, lang: 'en' | 'zh'): string {
  const kinds = new Set(l.items.map((i) => i.t))
  const bits: string[] = []
  const t = letterText(l)
  if (t) bits.push(t.replace(/\s+/g, ' ').slice(0, 60))
  if (kinds.has('drawing')) bits.push(lang === 'zh' ? '一幅涂鸦' : 'a drawing')
  if (kinds.has('photo')) bits.push(lang === 'zh' ? '一张照片' : 'a photo')
  if (l.voice) bits.push(lang === 'zh' ? '一段声音' : 'a voice note')
  if (!bits.length && l.items.length) bits.push(lang === 'zh' ? '一些贴纸' : 'some stickers')
  return bits.join(' · ')
}
