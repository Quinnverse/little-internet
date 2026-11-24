import { z } from 'zod'

/** Shared low-level validators. No imports from the rest of core, so any schema module can use them. */

export const ID_PATTERN = /^[a-z0-9_-]{1,40}$/
export const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
export const HEX_COLOR = /^#[0-9a-f]{6}$/

// Characters that are invalid in XML 1.0 or that do not survive UTF-8 round trips.
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
const LINE_BREAKS = /[\n\r\t\u2028\u2029]/

export function isSafeText(s: string): boolean {
  return !FORBIDDEN_CHARS.test(s) && !LONE_SURROGATE.test(s)
}

export function isSafeLine(s: string): boolean {
  return isSafeText(s) && !LINE_BREAKS.test(s)
}

/** Canonical http(s) URL with no embedded credentials. */
export function isCanonicalHttpUrl(s: string): boolean {
  if (s.length > 2048) return false
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return false
  }
  return (
    (u.protocol === 'http:' || u.protocol === 'https:') &&
    u.username === '' &&
    u.password === '' &&
    u.href === s
  )
}

export const line = (max: number) =>
  z.string().max(max).refine(isSafeLine, 'contains characters that are not allowed')
export const text = (max: number) =>
  z.string().max(max).refine(isSafeText, 'contains characters that are not allowed')
export const id = z.string().regex(ID_PATTERN)
export const httpUrl = z.string().refine(isCanonicalHttpUrl, 'must be a plain http(s) URL')
export const color = z.string().regex(HEX_COLOR, 'must be a #rrggbb colour')
export const isoDate = z
  .string()
  .regex(ISO_UTC_PATTERN)
  .refine((s) => new Date(s).toISOString() === s, 'invalid date')
