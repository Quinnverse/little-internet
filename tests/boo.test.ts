import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EMPTY_CONTEXT, searchTerms, understand, type BooContext, type BooInput } from '../src/core/boo.ts'
import { addPost, compose, createProject, setVisibility } from '../src/editor/commands.ts'
import { projectArb } from './arbitraries.ts'

const NOW = new Date('2026-11-24T12:00:00.000Z')
const base = createProject({ title: 'Home', slug: 'home', style: 'blank', ghostName: 'Boo', ghostColor: 'white' })
const posts = compose(
  addPost({ id: 'r1', createdAt: '2026-11-02T09:00:00.000Z', title: 'Rainy Sunday', body: 'It rained all afternoon and I finished a slim novel.', imageIds: [], kind: 'reading', tags: ['rain'], fields: { book: 'Pillow Book', author: 'Sei Shonagon' } }),
  addPost({ id: 'd1', createdAt: '2026-11-20T09:00:00.000Z', title: '海边的一天', body: '今天去了海边，沙子很暖，下午下了一点雨。', imageIds: [] }),
  addPost({ id: 'd2', createdAt: '2026-10-05T09:00:00.000Z', title: 'Work', body: 'Long meetings. Nothing else.', imageIds: [] }),
  addPost({ id: 'o1', createdAt: '2025-11-24T09:00:00.000Z', title: 'A year ago', body: 'Autumn walk.', imageIds: [], kind: 'outfit', fields: { occasion: 'park' } }),
  setVisibility('r1', 'public'),
)(base).posts

const ask = (text: string, ctx: BooContext = EMPTY_CONTEXT, lang: 'en' | 'zh' = 'en') =>
  understand({ text, ctx, posts, lang, now: NOW, name: 'Boo' } satisfies BooInput)

describe('Boo 2.0 local brain', () => {
  it('B1: finds records by words, title, tags and structured fields (English and Chinese)', () => {
    expect(ask('find notes about rain').reply.cards.map((c) => c.postId)).toContain('r1')
    expect(ask('what did I write about the pillow book?').reply.cards[0]?.postId).toBe('r1')
    expect(ask('沙子').reply.cards[0]?.postId).toBe('d1')
    expect(ask('下雨 的记录', EMPTY_CONTEXT, 'zh').reply.cards.map((c) => c.postId)).toContain('d1')
    expect(ask('#rain').reply.cards.map((c) => c.postId)).toEqual(['r1'])
  })

  it('B2: understands time ranges and types', () => {
    expect(ask('what did I write this month?').reply.cards.map((c) => c.postId).sort()).toEqual(['d1', 'r1'])
    expect(ask('上个月我写了什么', EMPTY_CONTEXT, 'zh').reply.cards.map((c) => c.postId)).toEqual(['d2'])
    expect(ask('show my outfit records').reply.cards.map((c) => c.postId)).toEqual(['o1'])
    expect(ask('how many reading notes do I have').reply.text).toMatch(/1 /)
    expect(ask('on this day').reply.cards.map((c) => c.postId)).toEqual(['o1'])
  })

  it('B3: remembers the last results, so follow-ups work ("only private", "more", "make these private")', () => {
    const first = ask('what did I write this month?')
    expect(first.reply.cards.map((c) => c.postId).sort()).toEqual(['d1', 'r1'])
    const priv = ask('only private', first.ctx)
    expect(priv.reply.cards.map((c) => c.postId)).toEqual(['d1'])
    expect(ask('only public', first.ctx).reply.cards.map((c) => c.postId)).toEqual(['r1'])
    const prop = ask('make these private', first.ctx)
    expect(prop.reply.proposal?.action).toMatchObject({ type: 'visibility', to: 'private' })
    expect(prop.reply.proposal?.affected.map((c) => c.postId).sort()).toEqual(first.reply.cards.map((c) => c.postId).sort())
  })

  it('B4: it never changes anything: actions only come back as proposals', () => {
    const before = JSON.stringify(posts)
    const a = ask('find notes about rain')
    ask('make these public', a.ctx)
    ask('tag these as cozy', a.ctx)
    ask('star these', a.ctx)
    expect(JSON.stringify(posts)).toBe(before)
    expect(ask('make these public', a.ctx).reply.proposal?.summary).toMatch(/visitors/i)
    expect(ask('tag these as #cozy', a.ctx).reply.proposal?.action).toEqual({ type: 'tag', ids: a.ctx.shown, tag: 'cozy' })
  })

  it('B5: an action with nothing selected asks for records first instead of guessing', () => {
    expect(ask('make these private').reply.proposal).toBeUndefined()
    expect(ask('make these private').reply.text).toMatch(/find|找/i)
  })

  it('B6: answers honestly when it knows nothing, and offers kind words, not advice, for feelings', () => {
    expect(ask('tell me about zebras').reply.text).toMatch(/can't find/i)
    const sad = ask("I'm so tired today").reply
    expect(sad.text).toMatch(/here/i)
    expect(sad.text).not.toMatch(/doctor|therap|medic|diagnos/i)
    expect(sad.open).toBe('write')
  })

  it('B7: deterministic and total: any text gives a reply; same input, same output; cards only reference known records', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), fc.constantFrom('en' as const, 'zh' as const), (text, lang) => {
        const a = understand({ text, ctx: EMPTY_CONTEXT, posts, lang, now: NOW, name: 'Boo' })
        const b = understand({ text, ctx: EMPTY_CONTEXT, posts, lang, now: NOW, name: 'Boo' })
        expect(a).toEqual(b)
        expect(a.reply.text.length).toBeGreaterThan(0)
        const ids = new Set(posts.map((p) => p.id))
        for (const c of a.reply.cards) expect(ids.has(c.postId)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('B8: any project and any text: no crash, cards only point at that project\'s own records', () => {
    fc.assert(
      fc.property(projectArb, fc.constantFrom('find notes', 'how many diary', 'on this day', '#a', 'last week', '搜索 照片'), (p, text) => {
        const out = understand({ text, ctx: EMPTY_CONTEXT, posts: p.posts, lang: 'en', now: NOW, name: 'Boo' })
        const ids = new Set(p.posts.map((x) => x.id))
        for (const c of [...out.reply.cards, ...(out.reply.proposal?.affected ?? [])]) expect(ids.has(c.postId)).toBe(true)
      }),
      { numRuns: 60 },
    )
  })

  it('searchTerms drops filler words and splits Chinese into phrases and bigrams', () => {
    expect(searchTerms('what did I write about the rain')).toEqual(['rain'])
    expect(searchTerms('关于下雨的记录')).toEqual(expect.arrayContaining(['下雨']))
  })
})
