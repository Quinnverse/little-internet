import fc from 'fast-check'
import { unzipSync } from 'fflate'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../src/core/backup.ts'
import { exportSite, importSite } from '../src/core/exportZip.ts'
import { CSP, generateSite } from '../src/core/generate.ts'
import { normalize } from '../src/core/normalize.ts'
import { publicProjection } from '../src/core/privacy.ts'
import { parseProject, type Project } from '../src/core/schema.ts'
import { embedSrc } from '../src/core/video.ts'
import { markedProjectArb, PRIVATE_MARK, projectArb } from './arbitraries.ts'

const RUNS = { numRuns: 150 }

// Inline SVG letters (public gifts) live inside <figure class="gift-letter">. They get their own strict lists.
const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'line', 'text', 'tspan', 'image', 'defs', 'filter', 'fegaussianblur', 'femerge', 'femergenode', 'animate'])
const SVG_ATTRS = new Set([
  'xmlns', 'xmlns:xlink', 'viewbox', 'width', 'height', 'transform', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'opacity', 'font-size', 'font-family', 'text-anchor',
  'dy', 'xml:space', 'filter', 'id', 'shape-rendering', 'stddeviation', 'result', 'in', 'preserveaspectratio', 'href', 'attributename', 'from', 'to', 'dur', 'begin',
])
const SAFE_IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/
const dec = new TextDecoder()

const ALLOWED_TAGS = new Set([
  'html', 'head', 'meta', 'title', 'link', 'script', 'body', 'div', 'header', 'p', 'a', 'main',
  'section', 'img', 'h1', 'h2', 'ul', 'li', 'time', 'footer', 'nav', 'article', 'figure', 'iframe', 'br',
  'audio', 'span', 'svg', 'rect', 'form', 'input', 'textarea', 'button', 'figcaption', 'strong', 'dl', 'dt', 'dd',
])
const ALLOWED_ATTRS = new Set([
  'lang', 'charset', 'name', 'content', 'http-equiv', 'rel', 'href', 'type', 'title', 'class', 'id', 'src',
  'alt', 'loading', 'datetime', 'aria-label', 'allow', 'referrerpolicy', 'data-ghost-home', 'defer',
  'controls', 'preload', 'data-w', 'data-page', 'role', 'aria-current', 'aria-hidden', 'focusable', 'viewBox',
  'shape-rendering', 'x', 'y', 'width', 'height', 'fill', 'hidden', 'maxlength', 'placeholder', 'required',
  'tabindex', 'autocomplete', 'readonly', 'rows', 'data-badge-code', 'data-file', 'data-prefix', 'data-title',
  'data-abs', 'data-copy', 'data-gb', 'data-gb-list', 'data-gb-status',
])

function htmlFiles(files: Map<string, Uint8Array>) {
  return [...files].filter(([path]) => path.endsWith('.html')).map(([path, b]) => [path, dec.decode(b)] as const)
}

describe('site core properties', () => {
  it('arbitrary projects are valid (sanity)', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const r = parseProject(p)
        if (!r.ok) throw new Error(r.reason)
      }),
      RUNS,
    )
  })

  // P1 — Requirement 5.2
  it('P1: import(export(p)) equals the normalized public projection', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const r = importSite(exportSite(p))
        expect(r).toEqual({ ok: true, value: normalize(publicProjection(p)) })
      }),
      RUNS,
    )
  })

  // P2 — Requirement 7.2
  it('P2: restoreBackup(createBackup(p)) equals normalize(p), drafts included', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        expect(restoreBackup(createBackup(p))).toEqual({ ok: true, value: normalize(p) })
      }),
      RUNS,
    )
  })

  // P3 — Requirements 3.5, 3.6
  it('P3: user text never creates markup, scripts or unsafe URLs', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const files = generateSite(p)
        for (const [path, html] of htmlFiles(files)) {
          const dom = new JSDOM(html)
          const doc = dom.window.document
          for (const el of doc.querySelectorAll('*')) {
            const tag = el.tagName.toLowerCase()
            if (el.closest('figure.gift-letter') && tag !== 'figure') {
              expect(SVG_TAGS.has(tag), `${path}: unexpected <${tag}> in a gift letter`).toBe(true)
              for (const attr of el.getAttributeNames()) {
                expect(SVG_ATTRS.has(attr.toLowerCase()), `${path}: unexpected ${attr} in a gift letter`).toBe(true)
                expect(attr.toLowerCase().startsWith('on')).toBe(false)
                if (attr === 'href') expect(tag === 'image' && SAFE_IMAGE.test(el.getAttribute(attr)!)).toBe(true)
              }
              continue
            }
            if (el.tagName.toLowerCase() === 'figure' && el.classList.contains('gift-letter')) {
              expect(el.getAttributeNames().sort()).toEqual(['aria-label', 'class', 'role'])
              continue
            }
            expect(ALLOWED_TAGS.has(tag), `${path}: unexpected <${tag}>`).toBe(true)
            for (const attr of el.getAttributeNames()) {
              expect(ALLOWED_ATTRS.has(attr), `${path}: unexpected attribute ${attr}`).toBe(true)
              if (attr === 'href' || attr === 'src') {
                expect(/^\s*(javascript|data|vbscript):/i.test(el.getAttribute(attr)!)).toBe(false)
              }
            }
          }
          const csp = doc.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
          expect(csp.length).toBe(1)
          expect(csp[0]!.getAttribute('content')).toBe(CSP)

          for (const s of doc.querySelectorAll('script')) {
            if (s.getAttribute('type') === 'application/json') {
              expect(['ghost-data', 'room-data', 'site-data']).toContain(s.id)
              const data = JSON.parse(s.textContent!)
              if (s.id === 'ghost-data') {
                expect(data.name).toBe(p.ghost.name)
                expect(data.greeting).toContain(p.site.title)
              } else if (s.id === 'site-data') {
                expect(data.slug).toBe(p.site.slug)
              } else {
                // Only the home page carries the room, and it is the same escaped title text.
                expect(path).toBe('index.html')
                expect(data.title).toBe(p.site.title)
              }
            } else {
              expect(['ghost.js', '../ghost.js', 'room.js', 'site.js', '../site.js']).toContain(s.getAttribute('src'))
              expect(s.textContent).toBe('')
            }
          }
          expect(doc.querySelectorAll('script').length).toBe(2 + (p.ghost.enabled ? 2 : 0) + (path === 'index.html' ? 2 : 0))
          // Escaping is exact: the title round-trips as text, not as markup.
          expect(doc.querySelector('.site-title a')!.textContent).toBe(p.site.title)
          dom.window.close()
        }
        const css = dec.decode(files.get('style.css')!)
        expect(css).not.toMatch(/@import|<\/|expression\(|javascript:/i)
        // The only URLs in CSS are fixed inline SVG patterns and the site's own background image.
        for (const m of css.matchAll(/url\(([^)]*)\)/g)) {
          expect(m[1]!, 'css url').toMatch(/^"(data:image\/svg\+xml,[^"]*|assets\/[a-z0-9_-]+\.(png|jpg|webp|gif))"$/)
          const ref = /^"assets\/(.+)"$/.exec(m[1]!)
          if (ref) expect(files.has(`assets/${ref[1]}`)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  // P4 — Requirements 6.1, 6.2
  it('P4: private posts and private-only images never appear in a site export', () => {
    fc.assert(
      fc.property(markedProjectArb, (p) => {
        const entries = unzipSync(exportSite(p))
        for (const [name, data] of Object.entries(entries)) {
          if (name.startsWith('assets/')) continue
          expect(dec.decode(data), name).not.toContain(PRIVATE_MARK)
        }
        const pub = publicProjection(p)
        const kept = new Set(pub.assets.map((a) => a.id))
        for (const a of p.assets) {
          if (kept.has(a.id)) continue
          expect(Object.keys(entries).some((n) => n.startsWith(`assets/${a.id}.`))).toBe(false)
        }
        for (const r of p.recordings) {
          const shipped = Object.keys(entries).some((n) => n.startsWith(`audio/${r.id}.`))
          expect(shipped, `recording ${r.id} (${r.visibility})`).toBe(r.visibility === 'public')
        }
      }),
      RUNS,
    )
  })

  // P6 — Requirements 3.2–3.4
  it('P6: every reference is relative and resolves, or is an allowed external URL', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const files = generateSite(p)
        const pub = publicProjection(p)
        const external = new Set<string>([
          ...pub.links.map((l) => l.url),
          ...Object.values(pub.webring).filter((u): u is string => !!u),
          ...pub.posts.flatMap((x) => (x.video ? [embedSrc(x.video)] : [])),
          ...pub.web.draft.widgets.flatMap((w) => (w.content.type === 'image' && w.content.href ? [w.content.href] : [])),
        ])
        const check = (page: string, ref: string) => {
          if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) {
            expect(external.has(ref), `${page}: unexpected external ${ref}`).toBe(true)
            return
          }
          expect(ref.startsWith('/'), `${page}: absolute path ${ref}`).toBe(false)
          const resolved = new URL(ref, `https://host.test/@site/${page}`)
          const target = decodeURIComponent(resolved.pathname.replace(/^\/@site\//, ''))
          expect(files.has(target), `${page}: ${ref} does not resolve`).toBe(true)
        }
        for (const [page, html] of htmlFiles(files)) {
          const dom = new JSDOM(html)
          const doc = dom.window.document
          for (const el of doc.querySelectorAll('[href],[src]')) {
            const ref = el.getAttribute('href') ?? el.getAttribute('src')!
            check(page, ref)
          }
          const ghost = doc.getElementById('ghost-data')
          if (ghost) for (const g of JSON.parse(ghost.textContent!).guide) check(page, g.href)
          dom.window.close()
        }
      }),
      RUNS,
    )
  })

  // P7 — Requirement 3.7
  it('P7: generation and export are deterministic', () => {
    fc.assert(
      fc.property(projectArb, (p: Project) => {
        expect(generateSite(p)).toEqual(generateSite(structuredClone(p)))
        expect(exportSite(p)).toEqual(exportSite(structuredClone(p)))
      }),
      { numRuns: 50 },
    )
    // Every export compresses room.js (three.js + the embedded models, about 2 MB): 100 exports take a while.
  }, 180_000)
})
