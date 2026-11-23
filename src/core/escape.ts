const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escapes text for HTML element content and for double-quoted attribute values. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!)
}

/** Escapes text for XML (RSS). Input must already pass `isSafeText`. */
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (c === "'" ? '&apos;' : HTML_ESCAPES[c]!))
}

/**
 * JSON that is safe inside `<script type="application/json">`: it cannot close the
 * script element, open a comment, or be split by JS line terminators.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
