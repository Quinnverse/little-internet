import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addItem, BLANK_LETTER, letterIsEmpty, LetterSchema, letterText, letterToSvg, MAX_ITEMS, PAPERS, removeItem, restack, updateItem, type Letter, type LetterItem } from '../src/core/letter.ts'
import { DEFAULT_PEN, heartStroke } from '../src/core/strokes.ts'

const text = (id: string, t: string): LetterItem => ({ t: 'text', id, x: 100, y: 200, rot: 0, scale: 1, text: t, font: 'hand', color: '#3a2a20', size: 40 })
const heart: LetterItem = { t: 'drawing', id: 'd1', x: 500, y: 600, rot: 0, scale: 1, drawing: { v: 1, strokes: [heartStroke(500, 500, 250, DEFAULT_PEN)] } }

describe('Letter', () => {
  it('L1: a letter can be just a heart: no text required', () => {
    const l: Letter = { ...BLANK_LETTER, items: [heart] }
    expect(LetterSchema.safeParse(l).success).toBe(true)
    expect(letterIsEmpty(l)).toBe(false)
    expect(letterIsEmpty(BLANK_LETTER)).toBe(true)
    expect(letterIsEmpty({ ...BLANK_LETTER, voice: { mime: 'audio/webm', data: 'data:audio/webm;base64,AAAA', ms: 1200 } })).toBe(false)
  })

  it('L2: editing is pure; limits hold; stacking order changes', () => {
    let l = BLANK_LETTER
    for (let i = 0; i < MAX_ITEMS + 5; i++) l = addItem(l, text(`t${i}`, 'x'))
    expect(l.items).toHaveLength(MAX_ITEMS)
    expect(BLANK_LETTER.items).toHaveLength(0)
    const moved = updateItem(l, 't0', { x: 300, rot: 15 })
    expect(moved.items[0]).toMatchObject({ x: 300, rot: 15 })
    expect(restack(l, 't0', 1).items[1]!.id).toBe('t0')
    expect(restack(l, 't0', -1)).toBe(l)
    expect(removeItem(l, 't0').items).toHaveLength(MAX_ITEMS - 1)
  })

  it('L3: rendering is deterministic and escapes everything the sender typed', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }).filter((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff]/.test(s)), fc.constantFrom(...PAPERS), (t, paper) => {
        const l: Letter = { ...BLANK_LETTER, paper, date: '24 Nov', items: [text('a', `<script>alert(1)</script>${t}`), heart] }
        const a = letterToSvg(l)
        expect(a).toBe(letterToSvg(l))
        expect(a).not.toContain('<script')
        expect(a).not.toMatch(/\son[a-z]+=/i)
        expect(a).toContain('&lt;script&gt;')
      }),
      { numRuns: 100 },
    )
  })

  it('L4: unsafe data is refused: scripts in photo/voice URLs, bad colours, oversized photos, path-like ids', () => {
    const bad = (it: unknown) => LetterSchema.safeParse({ ...BLANK_LETTER, items: [it] }).success
    const base = { id: 'a', x: 1, y: 1, rot: 0, scale: 1 }
    expect(bad({ ...base, t: 'photo', data: 'data:image/svg+xml;base64,PHN2Zz4=', frame: true })).toBe(false)
    expect(bad({ ...base, t: 'photo', data: 'https://evil.example/x.png', frame: true })).toBe(false)
    expect(bad({ ...base, t: 'photo', data: 'data:image/png;base64,"><script>', frame: true })).toBe(false)
    expect(bad({ ...base, t: 'photo', data: `data:image/png;base64,${'A'.repeat(200_000)}`, frame: false })).toBe(false)
    expect(bad({ ...base, t: 'photo', data: 'data:image/png;base64,iVBORw0KGgo=', frame: false })).toBe(true)
    expect(bad({ ...base, t: 'seal', color: 'red;}' })).toBe(false)
    expect(bad({ ...base, id: '../x', t: 'seal', color: '#aa0000' })).toBe(false)
    expect(bad({ ...base, t: 'text', text: 'x', font: 'comic-sans-evil', color: '#000000', size: 30 })).toBe(false)
    expect(LetterSchema.safeParse({ ...BLANK_LETTER, voice: { mime: 'audio/wav', data: 'data:audio/wav;base64,AAAA', ms: 500 } }).success).toBe(false)
  })

  it('L5: plain text of a letter is searchable', () => {
    expect(letterText({ ...BLANK_LETTER, items: [text('a', 'Miss you'), heart, text('b', 'See you soon')] })).toBe('Miss you\nSee you soon')
  })
})
