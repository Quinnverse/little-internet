import type { Post } from './schema.ts'

/**
 * Life Archive: one kind of record (a Post) with a type and a few structured fields.
 * Pure rules for types, fields, search, filters, timeline and Markdown export. No DOM.
 * Every record is still private by default, still one data source for Home, Journal and Web.
 */

export const POST_KINDS = ['diary', 'reading', 'collection', 'outfit', 'memo', 'photo', 'travel'] as const
export type PostKind = (typeof POST_KINDS)[number]

export const FIELD_KEYS = [
  'mood', 'weather', // diary
  'book', 'author', 'rating', 'status', 'quote', // reading
  'item', 'where', // collection
  'occasion', 'pieces', // outfit
  'due', 'done', // memo
  'place', 'from', 'to', // photo / travel
] as const
export type FieldKey = (typeof FIELD_KEYS)[number]

export type FieldType = 'line' | 'text' | 'date' | 'rating' | 'choice' | 'yesno'
export type FieldDef = { key: FieldKey; type: FieldType; choices?: readonly string[] }

export const KIND_FIELDS: Record<PostKind, readonly FieldDef[]> = {
  diary: [{ key: 'mood', type: 'line' }, { key: 'weather', type: 'line' }],
  reading: [
    { key: 'book', type: 'line' },
    { key: 'author', type: 'line' },
    { key: 'status', type: 'choice', choices: ['reading', 'finished', 'paused'] },
    { key: 'rating', type: 'rating' },
    { key: 'quote', type: 'text' },
  ],
  collection: [{ key: 'item', type: 'line' }, { key: 'where', type: 'line' }],
  outfit: [{ key: 'occasion', type: 'line' }, { key: 'weather', type: 'line' }, { key: 'pieces', type: 'text' }],
  memo: [{ key: 'due', type: 'date' }, { key: 'done', type: 'yesno' }],
  photo: [{ key: 'place', type: 'line' }],
  travel: [{ key: 'place', type: 'line' }, { key: 'from', type: 'date' }, { key: 'to', type: 'date' }],
}

export const MAX_TAGS = 12
export const TAG_PATTERN = /^[^\s,#<>"'&\u0000-\u001f]{1,24}$/u

/** "#Reading, cozy  winter" → ["reading", "cozy", "winter"]: lower case, no hashes, unique, valid. */
export function parseTags(input: string): string[] {
  const out: string[] = []
  for (const raw of input.split(/[,，、\n]+|\s+/)) {
    const t = raw.replace(/^#+/, '').trim().toLowerCase()
    if (t && TAG_PATTERN.test(t) && !out.includes(t)) out.push(t)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

type Lang = 'en' | 'zh'
const L: Record<string, [string, string]> = {
  'kind.diary': ['Diary', '日记'],
  'kind.reading': ['Reading note', '阅读笔记'],
  'kind.collection': ['Collection', '收藏'],
  'kind.outfit': ['Outfit', '穿搭'],
  'kind.memo': ['Memo', '备忘'],
  'kind.photo': ['Photo', '照片'],
  'kind.travel': ['Travel', '旅行'],
  'f.mood': ['Mood', '心情'],
  'f.weather': ['Weather', '天气'],
  'f.book': ['Book', '书名'],
  'f.author': ['Author', '作者'],
  'f.rating': ['Rating', '评分'],
  'f.status': ['Status', '阅读状态'],
  'f.quote': ['A line I want to keep', '书摘'],
  'f.item': ['Item', '物品'],
  'f.where': ['Where I found it', '来源'],
  'f.occasion': ['Occasion', '场合'],
  'f.pieces': ['Pieces', '单品'],
  'f.due': ['Due', '截止日期'],
  'f.done': ['Done', '完成'],
  'f.place': ['Place', '地点'],
  'f.from': ['From', '开始'],
  'f.to': ['To', '结束'],
  'c.reading': ['Reading', '在读'],
  'c.finished': ['Finished', '读完'],
  'c.paused': ['Paused', '搁置'],
  'c.yes': ['Yes', '是'],
  'c.no': ['Not yet', '还没有'],
}
export const archiveLabel = (key: string, lang: Lang): string => (L[key]?.[lang === 'zh' ? 1 : 0]) ?? key

export const defFor = (kind: PostKind, key: FieldKey): FieldDef | undefined => KIND_FIELDS[kind].find((d) => d.key === key)

/** Fields of a post that have a value, in the order its kind defines. Used by the page and by search. */
export function filledFields(p: Pick<Post, 'kind' | 'fields'>): { key: FieldKey; value: string }[] {
  const out: { key: FieldKey; value: string }[] = []
  for (const d of KIND_FIELDS[p.kind]) {
    const v = p.fields[d.key]
    if (v !== undefined && v.trim() !== '') out.push({ key: d.key, value: v })
  }
  return out
}

/** Human text of a field value (choices, yes/no and ratings are stored as plain text). */
export function fieldText(def: FieldDef, value: string, lang: Lang): string {
  if (def.type === 'rating') return '★'.repeat(Math.max(0, Math.min(5, Number(value) || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Number(value) || 0)))
  if (def.type === 'choice') return archiveLabel(`c.${value}`, lang)
  if (def.type === 'yesno') return archiveLabel(value === 'yes' ? 'c.yes' : 'c.no', lang)
  return value
}

// ------------------------------------------------------------------ search, filters, timeline

export type ArchiveFilter = {
  q: string
  kind: PostKind | 'all'
  tag: string | ''
  visibility: 'all' | 'public' | 'private'
  /** inclusive, YYYY-MM-DD */
  from: string
  to: string
  starred: boolean
}

export const EMPTY_FILTER: ArchiveFilter = { q: '', kind: 'all', tag: '', visibility: 'all', from: '', to: '', starred: false }

export function searchText(p: Post, lang: Lang): string {
  const fields = filledFields(p).map((f) => f.value)
  return [p.title, p.body, p.tags.join(' '), fields.join(' '), archiveLabel(`kind.${p.kind}`, lang)].join('\n').toLowerCase()
}

/** Newest first. Pure: the same posts and filter always give the same list. */
export function filterPosts(posts: readonly Post[], f: ArchiveFilter, lang: Lang = 'en'): Post[] {
  const needles = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return posts
    .filter((p) => {
      if (f.kind !== 'all' && p.kind !== f.kind) return false
      if (f.visibility !== 'all' && p.visibility !== f.visibility) return false
      if (f.tag && !p.tags.includes(f.tag)) return false
      if (f.starred && !p.starred) return false
      const day = p.createdAt.slice(0, 10)
      if (f.from && day < f.from) return false
      if (f.to && day > f.to) return false
      if (needles.length) {
        const hay = searchText(p, lang)
        if (!needles.every((n) => hay.includes(n))) return false
      }
      return true
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? -1 : 1))
}

export function allTags(posts: readonly Post[]): { tag: string; count: number }[] {
  const m = new Map<string, number>()
  for (const p of posts) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
}

export function countByKind(posts: readonly Post[]): Record<PostKind | 'all', number> {
  const out = { all: posts.length } as Record<PostKind | 'all', number>
  for (const k of POST_KINDS) out[k] = 0
  for (const p of posts) out[p.kind]++
  return out
}

/** Groups already-sorted posts by "YYYY-MM" for the timeline. */
export function groupByMonth(posts: readonly Post[]): { month: string; posts: Post[] }[] {
  const out: { month: string; posts: Post[] }[] = []
  for (const p of posts) {
    const month = p.createdAt.slice(0, 7)
    const last = out[out.length - 1]
    if (last && last.month === month) last.posts.push(p)
    else out.push({ month, posts: [p] })
  }
  return out
}

/** A readable Markdown copy of the chosen records (for the owner's own use; includes private ones if selected). */
export function postsToMarkdown(posts: readonly Post[], lang: Lang = 'en'): string {
  const blocks = posts.map((p) => {
    const head = `## ${p.title || p.createdAt.slice(0, 10)}`
    const meta = [`${archiveLabel(`kind.${p.kind}`, lang)} · ${p.createdAt.slice(0, 10)} · ${p.visibility}`, p.tags.length ? p.tags.map((t) => `#${t}`).join(' ') : '']
      .filter(Boolean)
      .join('  \n')
    const fields = filledFields(p).map((f) => `- **${archiveLabel(`f.${f.key}`, lang)}**: ${fieldText(defFor(p.kind, f.key)!, f.value, lang).replace(/\n/g, ' ')}`)
    return [head, meta, fields.join('\n'), p.body.trim()].filter(Boolean).join('\n\n')
  })
  return `# Little Internet archive\n\n${blocks.join('\n\n---\n\n')}\n`
}
