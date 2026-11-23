// Owner-only memories (ghost spec, Requirement 3). Pure, on-device, no network.
import type { Post } from '../core/schema.ts'

const newestFirst = (a: Post, b: Post) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)

/** Entries written on the same month/day (owner's local calendar) in earlier years. */
export function onThisDay(posts: readonly Post[], today: Date): Post[] {
  return posts
    .filter((p) => {
      const d = new Date(p.createdAt)
      return d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() < today.getFullYear()
    })
    .sort(newestFirst)
}

export type Memory = { post: Post; excerpt: string }

const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff

/** A ≤ ~120-char slice of `text` around index `at`, never splitting a surrogate pair. */
function around(text: string, at: number, len: number): string {
  let start = Math.max(0, at - 40)
  let end = Math.min(text.length, at + len + 80)
  if (start > 0 && isLow(text.charCodeAt(start))) start--
  if (end < text.length && isLow(text.charCodeAt(end))) end++
  return text.slice(start, end)
}

function find(text: string, query: string): number {
  const lower = text.toLowerCase()
  const i = lower.indexOf(query.toLowerCase())
  // Lower-casing can change string length for a few characters; then indices no longer
  // line up, so fall back to the start of the text (still a real substring).
  if (i < 0) return -1
  return lower.length === text.length ? i : 0
}

/** Most recent entries that contain the query (case-insensitive), with a real excerpt. */
export function askMemories(posts: readonly Post[], query: string, limit = 3): Memory[] {
  const q = query.trim()
  if (!q) return []
  const out: Memory[] = []
  for (const post of [...posts].sort(newestFirst)) {
    if (out.length >= limit) break
    for (const text of [post.body, post.title]) {
      const i = find(text, q)
      if (i >= 0) {
        // Raw substring; the UI collapses whitespace with CSS.
        out.push({ post, excerpt: around(text, i, q.length) })
        break
      }
    }
  }
  return out
}
