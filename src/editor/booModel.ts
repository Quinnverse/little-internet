import type { BooCard } from '../core/boo.ts'

/**
 * Optional language-model adapter for Boo. OFF by default. The local brain (src/core/boo.ts) always answers
 * first; a model can only REPHRASE that answer in a warmer voice. It cannot search, decide or change anything.
 *
 * Privacy rules enforced here (and tested against a mock server):
 *  1. Nothing is sent unless the owner turned the model on AND typed an endpoint themselves.
 *  2. By default only the owner's question and Boo's already-written reply TEXT are sent, never record cards,
 *     titles, bodies, tags or fields. Sending record text needs a second, separate consent switch.
 *  3. Only https endpoints (or http://localhost for development) are accepted; the key lives in this browser only.
 *  4. Any failure, timeout or odd answer falls back silently to the local reply.
 */

export type ModelSettings = {
  enabled: boolean
  endpoint: string
  model: string
  apiKey: string
  /** Second consent: allow the excerpts of matched records to be sent along. */
  sendRecordText: boolean
}

export const MODEL_OFF: ModelSettings = { enabled: false, endpoint: '', model: '', apiKey: '', sendRecordText: false }
const KEY = 'li-boo-model'

export function loadModelSettings(): ModelSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ModelSettings> | null
    return { ...MODEL_OFF, ...(raw ?? {}), enabled: !!raw?.enabled, sendRecordText: !!raw?.sendRecordText }
  } catch {
    return MODEL_OFF
  }
}

export function saveModelSettings(s: ModelSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function endpointAllowed(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.username || u.password) return false
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))
  } catch {
    return false
  }
}

/** What would be sent for a turn, so the UI can show it to the owner before and after. */
export function buildPayload(s: ModelSettings, question: string, localReply: string, cards: BooCard[], petName: string, lang: 'en' | 'zh') {
  const system =
    lang === 'zh'
      ? `你是${petName}，一只住在主人家里的温柔小幽灵。只用主人的语言，用一两句话，把“草稿回复”改写得更温暖自然。不要增加草稿里没有的事实，不要提建议或诊断，不要假装执行了任何操作。`
      : `You are ${petName}, a gentle little ghost who lives in the owner's home. Rewrite the DRAFT REPLY in one or two warm, natural sentences, in the owner's language. Do not add facts that are not in the draft, do not give advice or diagnoses, and never claim to have done anything.`
  const parts = [`Owner's message: ${question}`, `DRAFT REPLY: ${localReply}`]
  if (s.sendRecordText && cards.length) parts.push(`Matched records:\n${cards.map((c) => `- ${c.title} (${c.date}): ${c.excerpt}`).join('\n')}`)
  return { model: s.model, temperature: 0.6, max_tokens: 160, messages: [{ role: 'system', content: system }, { role: 'user', content: parts.join('\n\n') }] }
}

export async function rephrase(
  s: ModelSettings,
  question: string,
  localReply: string,
  cards: BooCard[],
  petName: string,
  lang: 'en' | 'zh',
  doFetch: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<string> {
  if (!s.enabled || !s.endpoint || !endpointAllowed(s.endpoint)) return localReply
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await doFetch(s.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}) },
      body: JSON.stringify(buildPayload(s, question, localReply, cards, petName, lang)),
      signal: ctl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!r.ok) return localReply
    const j = (await r.json()) as { choices?: { message?: { content?: unknown } }[] }
    const out = j.choices?.[0]?.message?.content
    if (typeof out !== 'string') return localReply
    const text = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
    return text && text.length <= 600 ? text : localReply
  } catch {
    return localReply
  } finally {
    clearTimeout(timer)
  }
}
