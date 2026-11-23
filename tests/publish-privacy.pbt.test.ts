import fc from 'fast-check'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { generateSite } from '../src/core/generate.ts'
import { publicProjection } from '../src/core/privacy.ts'
import { assetPath, recordingPath, type Project } from '../src/core/schema.ts'
import { markedProjectArb, PRIVATE_MARK, projectArb } from './arbitraries.ts'

/** All text-ish files of a generated site, decoded (binary media excluded). */
function textFiles(files: Map<string, Uint8Array>): string {
  const dec = new TextDecoder()
  return [...files.entries()]
    .filter(([n]) => !n.startsWith('assets/') && !n.startsWith('audio/'))
    .map(([, b]) => dec.decode(b))
    .join('\n')
}

describe('publish privacy properties', () => {
  it('private posts, recordings and their media never appear for ANY valid project', () => {
    fc.assert(
      fc.property(markedProjectArb, (p: Project) => {
        const files = generateSite(p, { baseUrl: 'https://little.quinnverse.tech/@alice/' })
        const text = textFiles(files)
        expect(text).not.toContain(PRIVATE_MARK)
        const privatePosts = p.posts.filter((x) => x.visibility === 'private')
        const privateRecs = p.recordings.filter((x) => x.visibility === 'private')
        const privateAssets = p.assets.filter((a) => {
          const usedByPublicPost = p.posts.some((x) => x.visibility === 'public' && x.imageIds.includes(a.id))
          const usedByPublicBlock = publicProjection(p).blocks.some((b) => b.content.kind === 'image' && b.content.assetId === a.id)
          return !usedByPublicPost && !usedByPublicBlock
        })
        for (const post of privatePosts) {
          expect(files.has(`posts/${post.slug}.html`)).toBe(false)
        }
        for (const rec of privateRecs) {
          expect(files.has(recordingPath(rec.id, rec.mime))).toBe(false)
        }
        for (const a of privateAssets) {
          expect(files.has(assetPath(a.id, a.mime))).toBe(false)
        }
      }),
      { numRuns: 120 },
    )
  })

  it('generated HTML contains no script other than the known ghost.js and no inline event handlers', () => {
    fc.assert(
      fc.property(projectArb, (p: Project) => {
        const files = generateSite(p)
        for (const [name, bytes] of files) {
          if (!name.endsWith('.html')) continue
          const dom = new JSDOM(new TextDecoder().decode(bytes))
          const doc = dom.window.document
          for (const el of Array.from(doc.querySelectorAll('*'))) {
            for (const attr of Array.from(el.attributes)) {
              // No inline event handlers of any kind.
              expect(attr.name.toLowerCase().startsWith('on')).toBe(false)
              // URL-bearing attributes must never resolve to an executable scheme.
              if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(attr.name.toLowerCase())) {
                const v = attr.value.trim().toLowerCase().replace(/[\u0000-\u0020]/g, '')
                expect(/^(javascript|data|vbscript):/.test(v)).toBe(false)
              }
            }
          }
          const scripts = Array.from(doc.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'))
          for (const src of scripts) expect(['ghost.js', '../ghost.js']).toContain(src)
          // The only inline script permitted is ghost-data (application/json, non-executable).
          for (const el of Array.from(doc.querySelectorAll('script:not([src])'))) {
            expect(el.getAttribute('type')).toBe('application/json')
            expect(el.getAttribute('id')).toBe('ghost-data')
          }
        }
      }),
      { numRuns: 80 },
    )
  })

  it('artifact contains no credential-like fields and never registers a service worker', () => {
    fc.assert(
      fc.property(projectArb, (p: Project) => {
        const text = textFiles(generateSite(p))
        for (const token of ['tokenHash', 'x-site-token', 'serviceWorker', 'SITE_TOKEN_SALT']) {
          expect(text).not.toContain(token)
        }
      }),
      { numRuns: 60 },
    )
  })

  it('flipping a post to private drops its page from the next generated artifact', () => {
    fc.assert(
      fc.property(projectArb, (p: Project) => {
        const marked = p.posts.find((x) => x.visibility === 'public')
        if (!marked) return
        const before = generateSite(p)
        expect(before.has(`posts/${marked.slug}.html`)).toBe(true)
        const afterProject: Project = {
          ...p,
          posts: p.posts.map((x) => (x.id === marked.id ? { ...x, visibility: 'private' as const } : x)),
        }
        const after = generateSite(afterProject)
        expect(after.has(`posts/${marked.slug}.html`)).toBe(false)
      }),
      { numRuns: 60 },
    )
  })
})
