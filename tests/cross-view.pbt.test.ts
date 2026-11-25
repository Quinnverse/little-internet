// Kiro Task A (cross-view privacy) and Task B (design ↔ preview ↔ publish ↔ export consistency).
import fc from 'fast-check'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { FONT_STACKS, normalizeDesign, pageWidgets } from '../src/core/design.ts'
import { generateSite, renderPreviewPage } from '../src/core/generate.ts'
import { publicProjection } from '../src/core/privacy.ts'
import { setVisibility } from '../src/editor/commands.ts'
import { projectArb } from './arbitraries.ts'

const dec = new TextDecoder()
const MARK = 'qqmarkx9'
const textFiles = (files: Map<string, Uint8Array>) =>
  [...files].filter(([n]) => !n.startsWith('assets/') && !n.startsWith('audio/') && !/^button\./.test(n) && n !== 'room.js' && n !== 'ghost.js' && n !== 'site.js')

describe('Task A: a public entry made private disappears from every public view', () => {
  it('A1: pages, RSS, room data, visitor guide, site.json and media all drop it', () => {
    fc.assert(
      fc.property(
        projectArb.filter((p) => p.posts.some((x) => x.visibility === 'public')),
        fc.nat(),
        (raw, pick) => {
          const publics = raw.posts.filter((x) => x.visibility === 'public')
          const target = publics[pick % publics.length]!
          const marked = {
            ...raw,
            posts: raw.posts.map((x) => (x.id === target.id ? { ...x, title: `${MARK}title`, body: `${MARK}body`, slug: `${MARK}slug` } : x)),
          }
          // Sanity: while public, the entry is visible in the generated site (its own page at least).
          const before = generateSite(marked)
          expect(before.has(`posts/${MARK}slug.html`)).toBe(true)

          const after = generateSite(setVisibility(target.id, 'private')(marked))
          expect(after.has(`posts/${MARK}slug.html`)).toBe(false)
          for (const [name, data] of textFiles(after)) expect(dec.decode(data), name).not.toContain(MARK)
          // Room data and the ghost's guide are embedded in index.html as JSON: no keepsake or link to it.
          const doc = new JSDOM(dec.decode(after.get('index.html')!))
          const room = JSON.parse(doc.window.document.getElementById('room-data')!.textContent!)
          expect(JSON.stringify(room)).not.toContain(MARK)
          expect(room.memory.every((m: { href: string }) => !m.href.includes(MARK))).toBe(true)
          const ghost = doc.window.document.getElementById('ghost-data')
          if (ghost) expect(ghost.textContent).not.toContain(MARK)
          doc.window.close()
          // Media: exactly the images a public entry, the design or a friend badge still uses are shipped.
          const pub = publicProjection(setVisibility(target.id, 'private')(marked))
          const shipped = new Set([...after.keys()].filter((n) => n.startsWith('assets/')).map((n) => n.slice(7).replace(/\.[a-z]+$/, '')))
          expect(shipped).toEqual(new Set(pub.assets.map((a) => a.id)))
        },
      ),
      { numRuns: 60 },
    )
  })
})

const sectionsOf = (html: string) => {
  const dom = new JSDOM(html)
  const out = [...dom.window.document.querySelectorAll('section[data-w]')].map((s) =>
    s.outerHTML.replace(/<div class="ghost-home"[^>]*>[\s\S]*?<\/div>/g, '<div class="ghost-home"></div>'),
  )
  dom.window.close()
  return out
}

describe('Task B: what the owner designs is what visitors get', () => {
  it('B1: widget order per page, layout CSS and tokens in the published site equal the published design', () => {
    fc.assert(
      fc.property(
        projectArb.filter((p) => !!p.web.published),
        (p) => {
          const files = generateSite(p)
          const d = normalizeDesign(publicProjection(p).web.draft)
          const css = dec.decode(files.get('style.css')!)
          // site.json carries exactly this design
          const stored = JSON.parse(dec.decode(files.get('site.json')!))
          expect(stored.web.draft).toEqual(JSON.parse(JSON.stringify(d)))
          d.pages.forEach((page, i) => {
            const html = dec.decode(files.get(i === 0 ? 'index.html' : `pages/${page.slug}.html`)!)
            const ids = [...html.matchAll(/data-w="([a-z0-9_-]+)"/g)].map((m) => m[1])
            expect(ids).toEqual(pageWidgets(d, page.id).map((w) => w.id))
          })
          for (const w of d.widgets) {
            const page = d.pages.find((x) => x.id === w.pageId)!
            expect(css).toContain(`.w-${w.id}{grid-column:span ${Math.min(w.layout.span, page.columns)}`)
            if (w.layout.mobile === 'hide') expect(css).toContain(`.w-${w.id}{display:none}`)
            if (w.layout.desktop === 'hide') expect(css).toContain(`.w-${w.id}{display:none}`)
          }
          expect(css).toContain(`--hfont:${FONT_STACKS[d.tokens.headingFont]}`)
          expect(css).toContain(`--font:${FONT_STACKS[d.tokens.bodyFont]}`)
          expect(css).toContain(`--bg:${d.tokens.bg}`)
          expect(css).toContain(`--accent:${d.tokens.accent}`)
        },
      ),
      { numRuns: 60 },
    )
  })

  it('B2: the Atelier preview renders the same components as the published page (same renderer)', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const preview = renderPreviewPage(p, p.web.draft.pages[0]!.id, (path) => path)
        const site = dec.decode(generateSite(p, { design: 'draft' }).get('index.html')!)
        expect(sectionsOf(preview)).toEqual(sectionsOf(site))
      }),
      { numRuns: 50 },
    )
  })

  it('B3: the draft never reaches visitors once a design is published', () => {
    fc.assert(
      fc.property(
        projectArb.filter((p) => !!p.web.published),
        (p) => {
          const edited = { ...p, web: { ...p.web, draft: { ...p.web.draft, welcome: `${MARK}draftwelcome` } } }
          for (const [name, data] of textFiles(generateSite(edited))) expect(dec.decode(data), name).not.toContain(MARK)
        },
      ),
      { numRuns: 40 },
    )
  })
})

describe('Task B: a visitor sees exactly the exported files', () => {
  it('B4: generateSite is deterministic, so publish (upload) and export (zip) carry identical bytes', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const a = generateSite(p)
        const b = generateSite(structuredClone(p))
        expect([...a.keys()]).toEqual([...b.keys()])
        for (const [k, v] of a) expect(v).toEqual(b.get(k))
      }),
      { numRuns: 30 },
    )
  })
})
