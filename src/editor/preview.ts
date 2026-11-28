// Preview is the real generated site (Requirement 6): we put generateSite's output in
// Cache Storage and the service worker serves it under <app>/preview/.
import type { DesignChoice } from '../core/privacy.ts'
import type { Project } from '../core/schema.ts'

export const PREVIEW_CACHE = 'li-preview'

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
}

export function contentType(path: string): string {
  return TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream'
}

let version = 0

export function previewSupported(): boolean {
  return 'serviceWorker' in navigator && 'caches' in window
}

export async function updatePreview(project: Project, design: DesignChoice = 'published'): Promise<string> {
  if (!previewSupported()) throw new Error('Preview needs a browser with service workers.')
  await navigator.serviceWorker.ready
  const base = new URL('preview/', document.baseURI)
  const {generateSite}=await import('../core/generate.ts')
  const files = generateSite(project, { design })
  const cache = await caches.open(PREVIEW_CACHE)
  const wanted = new Set([...files.keys()].map((p) => new URL(p, base).href))
  for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req)
  await Promise.all(
    [...files].map(([path, bytes]) =>
      cache.put(
        new URL(path, base).href,
        new Response(bytes as BodyInit, { headers: { 'Content-Type': contentType(path), 'Cache-Control': 'no-store' } }),
      ),
    ),
  )
  return `${new URL('index.html', base).href}?v=${++version}`
}
