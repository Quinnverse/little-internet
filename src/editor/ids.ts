import { POST_SLUG_PATTERN, SITE_SLUG_PATTERN } from '../core/schema.ts'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** 10 random lowercase alphanumerics (~51 bits). Matches the core ID pattern. */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

/** ASCII slug from any text; '' when nothing ASCII-like survives (e.g. CJK titles). */
export function slugify(text: string, max = 50): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

export function uniquePostSlug(title: string, id: string, taken: ReadonlySet<string>): string {
  const base = slugify(title) || slugify(`entry-${id}`)
  let candidate = base
  for (let n = 2; taken.has(candidate) || !POST_SLUG_PATTERN.test(candidate); n++) {
    candidate = `${base}-${n}`
    if (n > 1000) {
      candidate = slugify(`entry-${id}`)
      break
    }
  }
  return candidate
}

export function suggestSiteSlug(name: string): string {
  const s = slugify(name, 32)
  return SITE_SLUG_PATTERN.test(s) ? s : 'my-home'
}
