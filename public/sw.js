// Little Internet editor service worker.
// 1. Serves the live preview (generated site files) from Cache Storage under ./preview/.
// 2. Keeps the editor app shell usable offline after the first visit (network first, cache fallback).
// It must NEVER touch the API, published sites (/@slug/), the webring or health checks: those can hold
// owner-only data (guestbook inbox) or content that a closed door has to make unreachable.
const PREVIEW_CACHE = 'li-preview'
const SHELL_CACHE = 'li-shell-v2'
const NEVER = /(^|\/)(api|ring|vision)(\/|$)|\/healthz$|\/@[a-z0-9-]+(\/|$)/

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(
    // Older versions cached everything, API responses included. Drop those caches.
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('li-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
)

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (NEVER.test(url.pathname)) return

  const scope = new URL(self.registration.scope)
  const previewBase = new URL('preview/', scope)
  if (url.href.startsWith(previewBase.href)) {
    event.respondWith(
      caches
        .open(PREVIEW_CACHE)
        .then((c) => c.match(url.origin + url.pathname))
        .then((res) => res || new Response('Not in this site', { status: 404 })),
    )
    return
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match(new URL('./', scope).href) : undefined))
          .then((hit) => hit || new Response('Offline', { status: 503 })),
      ),
  )
})
