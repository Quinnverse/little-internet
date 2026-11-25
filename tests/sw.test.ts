import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

/** Runs public/sw.js against a fake service worker scope and reports whether it takes over a request. */
function load() {
  const handlers: Record<string, (e: unknown) => void> = {}
  const deleted: string[] = []
  const self = {
    location: { origin: 'https://little.example' },
    registration: { scope: 'https://little.example/' },
    clients: { claim: () => Promise.resolve() },
    skipWaiting: () => undefined,
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
  }
  const caches = {
    keys: () => Promise.resolve(['li-shell-v1', 'li-shell-v2', 'li-preview']),
    delete: (k: string) => (deleted.push(k), Promise.resolve(true)),
    open: () => Promise.resolve({ put: () => undefined, match: () => undefined }),
    match: () => Promise.resolve(undefined),
  }
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, URL, Response, fetch: () => Promise.resolve({ ok: true, type: 'basic', clone: () => ({}) }) })
  const takes = (url: string, method = 'GET') => {
    let taken = false
    handlers.fetch!({ request: { method, url, mode: 'navigate' }, respondWith: () => (taken = true) })
    return taken
  }
  return { takes, handlers, deleted }
}

describe('service worker never caches private or closable content', () => {
  const sw = load()
  it.each([
    'https://little.example/api/sites/moon/messages',
    'https://little.example/api/ring',
    'https://little.example/@moon/',
    'https://little.example/@moon/posts/a.html',
    'https://little.example/@moon/assets/x.png',
    'https://little.example/ring/',
    'https://little.example/ring/moon/next',
    'https://little.example/healthz',
    'https://little.example/vision/hand_landmarker.task',
    'https://little.example/vision/wasm/vision_wasm_internal.wasm',
  ])('leaves %s alone', (url) => expect(sw.takes(url)).toBe(false))

  it.each(['https://little.example/', 'https://little.example/index.html', 'https://little.example/assets/index-abc.js', 'https://little.example/preview/index.html'])(
    'still handles the app shell: %s',
    (url) => expect(sw.takes(url)).toBe(true),
  )

  it('ignores other origins and non-GET requests', () => {
    expect(sw.takes('https://elsewhere.example/x')).toBe(false)
    expect(sw.takes('https://little.example/', 'POST')).toBe(false)
  })

  it('removes the old shell cache that stored everything', async () => {
    let done: Promise<unknown> = Promise.resolve()
    sw.handlers.activate!({ waitUntil: (p: Promise<unknown>) => (done = p) })
    await done
    expect(sw.deleted).toEqual(['li-shell-v1'])
  })
})
