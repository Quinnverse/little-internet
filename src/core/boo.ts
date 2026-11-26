import { archiveLabel, EMPTY_FILTER, filledFields, filterPosts, parseTags, POST_KINDS, type ArchiveFilter, type PostKind } from './archive.ts'
import type { Post } from './schema.ts'

/**
 * Boo's local brain. Pure and deterministic: no network, no model, no randomness.
 *
 *   understand(text, context, posts, lang, now) → reply (+ new context)
 *
 * It only ever sees the OWNER's own records (the editor passes them in); the visitor's Boo has no access to this
 * module. Anything that would change content, tags, stars or visibility comes back as a *proposal* with the list
 * of affected records. Nothing is changed until the owner confirms in the UI.
 */

export type BooLang = 'en' | 'zh'

export type BooCard = { postId: string; title: string; date: string; excerpt: string; kind: PostKind; visibility: Post['visibility'] }

export type BooAction =
  | { type: 'visibility'; ids: string[]; to: 'public' | 'private' }
  | { type: 'tag'; ids: string[]; tag: string }
  | { type: 'star'; ids: string[] }

export type BooProposal = { action: BooAction; summary: string; affected: BooCard[] }

export type BooReply = {
  text: string
  cards: BooCard[]
  proposal?: BooProposal
  /** Short follow-up suggestions shown as buttons. */
  chips: string[]
  /** A hint for the UI: write something now, open the decorate mode, etc. */
  open?: 'write' | 'decorate' | 'archive'
}

export type BooContext = {
  filter: ArchiveFilter
  /** Free-text query of the last search (so "more" and "only private" continue it). */
  query: string
  /** Post ids shown last, in order; "make these private" refers to them. */
  shown: string[]
  offset: number
}

export const EMPTY_CONTEXT: BooContext = { filter: { ...EMPTY_FILTER }, query: '', shown: [], offset: 0 }

// ------------------------------------------------------------------ text helpers

const STOP_EN = new Set(['the', 'a', 'an', 'my', 'me', 'i', 'of', 'to', 'in', 'on', 'about', 'did', 'do', 'what', 'when', 'where', 'was', 'were', 'is', 'are', 'it', 'that', 'this', 'these', 'those', 'write', 'wrote', 'written', 'show', 'find', 'search', 'look', 'for', 'up', 'any', 'all', 'and', 'or', 'with', 'have', 'had', 'tell', 'please', 'can', 'you', 'remember', 'recall', 'notes', 'note', 'entries', 'entry', 'records', 'record', 'from', 'last', 'this', 'week', 'month', 'year', 'again', 'more'])
const STOP_ZH = ['我', '的', '了', '是', '在', '吗', '呢', '啊', '吧', '什么', '时候', '哪些', '哪里', '有没有', '有', '找', '搜索', '搜', '查', '看看', '看', '关于', '记录', '写过', '写', '请', '帮我', '一下', '那些', '这些', '给我', '告诉我', '还']

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

const hasCjk = (s: string) => /[\u3400-\u9fff]/.test(s)

/** Search terms from a free sentence: stop words removed; CJK text is matched as whole phrases and bigrams. */
export function searchTerms(input: string): string[] {
  let s = norm(input).replace(/[?？!！。,.，、;；:："“”'’()（）]/g, ' ')
  for (const w of STOP_ZH) s = s.split(w).join(' ')
  const terms = new Set<string>()
  for (const part of s.split(/\s+/).filter(Boolean)) {
    if (hasCjk(part)) {
      const chars = [...part].filter((c) => /[\u3400-\u9fff0-9a-z]/.test(c))
      const whole = chars.join('')
      if (whole.length >= 2) terms.add(whole)
      if (whole.length === 1) terms.add(whole)
      for (let i = 0; i + 1 < chars.length; i++) terms.add(chars[i]! + chars[i + 1]!)
    } else if (!STOP_EN.has(part) && part.length >= 2) terms.add(part)
  }
  return [...terms]
}

function scorePost(p: Post, terms: string[]): number {
  if (!terms.length) return 0
  const title = norm(p.title)
  const tags = p.tags.join(' ')
  const fields = filledFields(p).map((f) => norm(f.value)).join(' ')
  const body = norm(p.body)
  let score = 0
  for (const t of terms) {
    if (title.includes(t)) score += 4
    if (tags.includes(t)) score += 4
    if (fields.includes(t)) score += 3
    if (body.includes(t)) score += 1 + Math.min(2, body.split(t).length - 2)
  }
  return score
}

function excerptAround(p: Post, terms: string[]): string {
  const text = [p.fields.quote, p.body].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim() || p.title
  const low = text.toLowerCase()
  let at = -1
  for (const t of terms) {
    const i = low.indexOf(t)
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  const start = Math.max(0, (at < 0 ? 0 : at) - 40)
  const slice = text.slice(start, start + 140)
  return `${start > 0 ? '…' : ''}${slice}${start + 140 < text.length ? '…' : ''}`
}

export function toCard(p: Post, terms: string[] = []): BooCard {
  return { postId: p.id, title: p.title || p.createdAt.slice(0, 10), date: p.createdAt.slice(0, 10), excerpt: excerptAround(p, terms), kind: p.kind, visibility: p.visibility }
}

// ------------------------------------------------------------------ time ranges

function rangeFor(s: string, now: Date): { from: string; to: string; label: [string, string] } | null {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = (startOfDay.getUTCDay() + 6) % 7 // Monday = 0
  const monday = new Date(startOfDay.getTime() - dow * 86400000)
  const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (/last week|上周|上星期/.test(s)) return { from: day(plus(monday, -7)), to: day(plus(monday, -1)), label: ['last week', '上周'] }
  if (/this week|本周|这周|这星期/.test(s)) return { from: day(monday), to: day(plus(monday, 6)), label: ['this week', '本周'] }
  if (/last month|上个月|上月/.test(s)) {
    const py = m === 0 ? y - 1 : y
    const pm = m === 0 ? 11 : m - 1
    return { from: `${py}-${pad(pm + 1)}-01`, to: `${py}-${pad(pm + 1)}-${pad(lastDay(py, pm))}`, label: ['last month', '上个月'] }
  }
  if (/this month|这个月|本月/.test(s)) return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay(y, m))}`, label: ['this month', '这个月'] }
  if (/last year|去年/.test(s)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: ['last year', '去年'] }
  if (/this year|今年/.test(s)) return { from: `${y}-01-01`, to: `${y}-12-31`, label: ['this year', '今年'] }
  if (/yesterday|昨天/.test(s)) return { from: day(plus(startOfDay, -1)), to: day(plus(startOfDay, -1)), label: ['yesterday', '昨天'] }
  if (/\btoday\b|今天/.test(s)) return { from: day(startOfDay), to: day(startOfDay), label: ['today', '今天'] }
  return null
}

const KIND_WORDS: [PostKind, RegExp][] = [
  ['reading', /reading note|book|read|阅读|读书|书摘|书/],
  ['outfit', /outfit|wear|clothes|穿搭|穿/],
  ['collection', /collection|collect|收藏/],
  ['memo', /memo|to-?do|reminder|备忘|待办/],
  ['photo', /photo|picture|照片|相片/],
  ['travel', /travel|trip|journey|旅行|旅游|出行/],
  ['diary', /diary|journal|日记/],
]

function kindIn(s: string): PostKind | null {
  for (const [k, re] of KIND_WORDS) if (re.test(s)) return k
  return null
}

// ------------------------------------------------------------------ the brain

const T = (lang: BooLang, en: string, zh: string) => (lang === 'zh' ? zh : en)

function chipsFor(lang: BooLang): string[] {
  return lang === 'zh' ? ['往年今日', '这个月我写了什么', '我有多少阅读笔记', '帮我找关于雨的记录'] : ['On this day', 'What did I write this month?', 'How many reading notes do I have?', 'Find notes about rain']
}

export type BooInput = { text: string; ctx: BooContext; posts: readonly Post[]; lang: BooLang; now: Date; name: string; freeSlots?: number; decorCount?: number }

export function understand(i: BooInput): { reply: BooReply; ctx: BooContext } {
  const { posts, lang, now } = i
  const raw = i.text.trim()
  const s = norm(raw)
  const ctx = i.ctx
  const reply = (r: Partial<BooReply> & { text: string }, next: Partial<BooContext> = {}): { reply: BooReply; ctx: BooContext } => ({
    reply: { cards: [], chips: [], ...r },
    ctx: { ...ctx, ...next },
  })

  if (!s) return reply({ text: T(lang, 'I am listening.', '我在听。'), chips: chipsFor(lang) })

  // ---- greetings and small talk
  if (/^(hi|hello|hey|yo|good (morning|evening|night)|你好|嗨|哈喽|早|晚上好|晚安|在吗)/.test(s) && s.length <= 14) {
    const n = posts.length
    return reply({
      text: n
        ? T(lang, `Hi! I'm ${i.name}. I remember ${n} of your records. Ask me anything about them.`, `嗨！我是${i.name}。我记得你的 ${n} 条记录，随便问我。`)
        : T(lang, `Hi! I'm ${i.name}. Nothing is written yet. Whenever you like, we can start with one line.`, `嗨！我是${i.name}。现在还没有记录，想写的时候，从一句话开始就好。`),
      chips: n ? chipsFor(lang) : [T(lang, 'Write something', '写点什么')],
    })
  }
  if (/who are you|what are you|你是谁|你是什么/.test(s))
    return reply({ text: T(lang, `I'm ${i.name}, a little ghost who lives in your home. I only know what you wrote, and I only read it on this device unless you connect a model.`, `我是${i.name}，住在你家里的小幽灵。我只知道你写过的东西，而且只在这台设备上读，除非你自己连接模型。`) })
  if (/thank|thanks|谢谢|谢了/.test(s)) return reply({ text: T(lang, 'Any time.', '随时。') })
  if (/help|what can you do|你能做什么|能做什么|你会什么|帮助/.test(s))
    return reply({
      text: T(
        lang,
        'Ask me to find records ("notes about rain"), look at a time ("what did I write last month?"), count things ("how many reading notes?"), or change several at once ("make these private"). I always show you what would change and wait for your yes.',
        '你可以让我找记录（“关于雨的记录”）、看某段时间（“上个月我写了什么”）、数一数（“有多少阅读笔记”），或一次改几条（“把这些设为私密”）。我总会先告诉你会改什么，等你点头。',
      ),
      chips: chipsFor(lang),
    })

  // ---- feelings: kind words, then an offer to write (never advice, never medical)
  if (/(i am|i'm|im|feel|feeling) (so |very |really )?(sad|tired|anxious|lonely|stressed|down|happy|excited|calm)|我(很|好|有点)?(难过|累|焦虑|孤独|压力|开心|高兴|平静)|心情不好/.test(s)) {
    const low = /sad|tired|anxious|lonely|stressed|down|难过|累|焦虑|孤独|压力|心情不好/.test(s)
    return reply({
      text: low
        ? T(lang, "I'm here. You don't have to fix anything. If you'd like, we can put a few words about it somewhere only you can read.", '我在这儿。不用马上解决什么。如果愿意，可以把几句话写在只有你能看到的地方。')
        : T(lang, "That's lovely to hear. Want to keep a line about it?", '真好。要不要留一句话记下来？'),
      chips: [T(lang, 'Write something', '写点什么')],
      open: 'write',
    })
  }

  if (/写封信|怎么写信|信件建议|make a letter|write a letter|letter idea/.test(s)) {
    return reply({ text: T(lang, 'Think of one moment you shared. Start with “I still remember…” and add a photo, a pressed flower sticker or your voice. You can choose a recipient in Letters when it feels ready.', '想一件你们一起经历的小事，从“我还记得……”写起。可以夹一张照片、贴一朵花，或者录下你的声音。写好后再去信件里选收件人。') })
  }

  // ---- decoration help (uses real counts from the room)
  if (/decorat|furniture|what should i put|装修|摆什么|家具|布置/.test(s) && !/note|record|记录|笔记/.test(s)) {
    const free = i.freeSlots ?? 0
    return reply({
      text: T(
        lang,
        free > 0
          ? `Your shelves and walls have ${free} free spots for keepsakes. Pick a keepsake when you save an entry, or open Decorate to move things around.`
          : 'Your keepsake spots are all used. Open Decorate to rearrange, or remove one you no longer want on display.',
        free > 0 ? `你的书架和墙面还有 ${free} 个空位可以放纪念物。保存记录时可以挑一个，或者进入装修模式调整布局。` : '纪念物的位置都用完了。进入装修模式调整布局，或者移走不想展示的。',
      ),
      chips: [T(lang, 'Open Decorate', '去装修')],
      open: 'decorate',
    })
  }

  // ---- continuing the last search
  if (/^(more|show more|next|还有吗|更多|再来|继续)/.test(s) && ctx.query + ctx.shown.join('') !== '') {
    return search({ ...i, text: ctx.query }, ctx.filter, ctx.query, ctx.offset + 3, true)
  }
  if (/only private|just private|只看私密|只要私密/.test(s)) return search({ ...i, text: ctx.query }, { ...ctx.filter, visibility: 'private' }, ctx.query, 0)
  if (/only public|just public|只看公开|只要公开/.test(s)) return search({ ...i, text: ctx.query }, { ...ctx.filter, visibility: 'public' }, ctx.query, 0)

  // ---- on this day
  if (/on this day|往年今日|去年的今天|历年今天|这一天/.test(s)) {
    const md = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
    const hits = posts.filter((p) => p.createdAt.slice(5, 10) === md && p.createdAt.slice(0, 4) < String(now.getUTCFullYear()))
    return reply(
      {
        text: hits.length ? T(lang, `On this day in earlier years you wrote ${hits.length} ${hits.length === 1 ? 'record' : 'records'}:`, `往年的今天，你写过 ${hits.length} 条记录：`) : T(lang, 'Nothing from this day in earlier years yet.', '往年的今天还没有记录。'),
        cards: hits.slice(0, 3).map((p) => toCard(p)),
        chips: hits.length ? [T(lang, 'Make these private', '把这些设为私密')] : [],
      },
      { shown: hits.slice(0, 3).map((p) => p.id), offset: 0, query: '' },
    )
  }

  // ---- counting
  if (/how many|count|多少|几条|几篇|有几/.test(s)) {
    const k = kindIn(s)
    const list = k ? posts.filter((p) => p.kind === k) : [...posts]
    const priv = list.filter((p) => p.visibility === 'private').length
    const label = k ? archiveLabel(`kind.${k}`, lang) : T(lang, 'records', '记录')
    return reply({
      text: T(lang, `${list.length} ${label}${k ? '' : ''}: ${priv} private, ${list.length - priv} public.`, `${label}共 ${list.length} 条：${priv} 条私密，${list.length - priv} 条公开。`),
      chips: list.length ? [T(lang, `Show ${label}`, `看看${label}`)] : [],
    }, k ? { filter: { ...EMPTY_FILTER, kind: k }, query: '', shown: [], offset: 0 } : {})
  }

  // ---- actions (always a proposal, never executed here)
  const act = /make (these|them|those|it) (private|public)|设为(私密|公开)|变成(私密|公开)|(these|them|those|这些|它们).{0,6}(private|public|私密|公开)/.exec(s)
  if (act) {
    const to: 'public' | 'private' = /public|公开/.test(act[0]) ? 'public' : 'private'
    return propose(i, { type: 'visibility', ids: ctx.shown, to }, to === 'public'
      ? T(lang, 'Make these public (visitors to your website will be able to read them)', '设为公开（访问你网站的人将能读到）')
      : T(lang, 'Make these private (they will disappear from your website the next time it is published)', '设为私密（下次发布时会从你的网站消失）'))
  }
  const tagM = /(?:tag|label) (?:these|them|those|it)(?: as| with)? #?([^\s]+)|给(?:这些|它们)?(?:加|打)(?:上)?(?:标签)?[ ：:]*#?([^\s]+)/.exec(raw)
  if (tagM) {
    const [tag] = parseTags(tagM[1] ?? tagM[2] ?? '')
    if (!tag) return reply({ text: T(lang, 'Which tag? For example "tag these #rain".', '加什么标签？比如“给这些加标签 雨天”。') })
    return propose(i, { type: 'tag', ids: ctx.shown, tag }, T(lang, `Add the tag #${tag}`, `添加标签 #${tag}`))
  }
  if (/star (these|them|those|it)|给(这些|它们)?加星|加星标/.test(s)) return propose(i, { type: 'star', ids: ctx.shown }, T(lang, 'Star these', '给这些加星标'))

  // ---- search (also the fallback for anything else with meaningful words)
  const kind = kindIn(s)
  const range = rangeFor(s, now)
  const filter: ArchiveFilter = { ...EMPTY_FILTER, ...(kind ? { kind } : {}), ...(range ? { from: range.from, to: range.to } : {}) }
  const terms = searchTerms(
    s
      .replace(/last week|this week|last month|this month|last year|this year|yesterday|today|上周|本周|这周|上个月|这个月|本月|去年|今年|昨天|今天/g, ' ')
      .replace(new RegExp(KIND_WORDS.map(([, re]) => re.source).join('|'), 'g'), ' '),
  )
  const tagOnly = /^#(\S+)$/.exec(raw)
  if (tagOnly) filter.tag = parseTags(tagOnly[1]!)[0] ?? ''
  return search(i, filter, tagOnly ? '' : terms.join(' '), 0, false, range?.label)
}

function propose(i: BooInput, action: BooAction, summary: string): { reply: BooReply; ctx: BooContext } {
  const { lang } = i
  const ids = action.ids
  if (!ids.length) return { reply: { text: T(lang, 'Show me some records first (ask me to find them), then tell me what to do with them.', '先让我找出一些记录，再告诉我怎么处理它们。'), cards: [], chips: chipsFor(lang) }, ctx: i.ctx }
  const byId = new Map(i.posts.map((p) => [p.id, p]))
  const affected = ids.map((id) => byId.get(id)).filter((p): p is Post => !!p).map((p) => toCard(p))
  return {
    reply: { text: T(lang, 'Here is what I would do. Nothing changes until you confirm:', '我打算这样做，你确认之前不会改动任何东西：'), cards: [], chips: [], proposal: { action, summary, affected } },
    ctx: i.ctx,
  }
}

function search(i: BooInput, filter: ArchiveFilter, query: string, offset: number, continued = false, rangeLabel?: [string, string]): { reply: BooReply; ctx: BooContext } {
  const { lang, posts } = i
  const terms = searchTerms(query)
  const pool = filterPosts(posts, { ...filter, q: '' }, lang)
  const rank = (ts: string[]) => {
    const scored = pool.map((p) => ({ p, s: scorePost(p, ts) })).filter((x) => x.s > 0)
    scored.sort((a, b) => b.s - a.s || (a.p.createdAt < b.p.createdAt ? 1 : -1))
    return scored.map((x) => x.p)
  }
  let results: Post[]
  let usedTerms = terms
  if (terms.length) {
    results = rank(terms)
    // Chinese has no spaces: if the phrases found nothing, try the characters one by one ("下雨" finds "下了一点雨").
    if (!results.length && hasCjk(query)) {
      const chars = [...new Set([...query].filter((c) => /[\u3400-\u9fff]/.test(c) && !'的了是在吗呢啊吧我有'.includes(c)))]
      if (chars.length) {
        results = rank(chars)
        usedTerms = chars
      }
    }
  } else {
    results = pool
  }
  const page = results.slice(offset, offset + 3)
  const when = rangeLabel ? T(lang, ` from ${rangeLabel[0]}`, `（${rangeLabel[1]}）`) : ''
  const what = filter.kind !== 'all' ? archiveLabel(`kind.${filter.kind}`, lang) : T(lang, 'records', '记录')
  let text: string
  if (!results.length) {
    text = terms.length
      ? T(lang, `I can't find anything about "${terms.join(' ')}"${when}. Try other words, or ask "how many records do I have?".`, `我没找到关于“${terms.join(' ')}”的${what}${when}。换个说法试试，或者问我“我有多少记录”。`)
      : T(lang, `No ${what}${when} yet.`, `${when}还没有${what}。`)
  } else if (continued && !page.length) {
    text = T(lang, "That's all I have for this.", '这些就是全部了。')
  } else if (terms.length) {
    text = T(lang, `I found ${results.length} ${results.length === 1 ? 'record' : 'records'} about "${terms.join(' ')}"${when}. ${offset ? 'More:' : 'The closest:'}`, `找到 ${results.length} 条关于“${terms.join(' ')}”的${what}${when}。${offset ? '更多：' : '最相关的：'}`)
  } else {
    text = T(lang, `${results.length} ${what}${when}. ${offset ? 'More:' : 'Newest first:'}`, `${when}共 ${results.length} 条${what}。${offset ? '更多：' : '按时间从新到旧：'}`)
  }
  const chips: string[] = []
  if (offset + 3 < results.length) chips.push(T(lang, 'More', '更多'))
  if (page.length) chips.push(T(lang, 'Make these private', '把这些设为私密'), T(lang, 'Only private ones', '只看私密'))
  return {
    reply: { text, cards: page.map((p) => toCard(p, usedTerms)), chips },
    ctx: { filter, query, shown: page.length ? page.map((p) => p.id) : i.ctx.shown, offset },
  }
}

/** The kinds Boo can talk about (for the UI hint). */
export const BOO_KINDS = POST_KINDS
