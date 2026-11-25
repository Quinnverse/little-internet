import fc from 'fast-check'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportSite } from '../src/core/exportZip.ts'
import { publicProjection } from '../src/core/privacy.ts'
import type { Project } from '../src/core/schema.ts'
import { projectArb } from './arbitraries.ts'

const dec = new TextDecoder()
const DRAFT = 'qqdraftonly'
const HIDDEN = 'qqhiddenwidget'

/** Puts marker text into the draft (never published) and into hidden widgets of the published design. */
function mark(p: Project): Project {
  const published = p.web.published
  const draft = { ...p.web.draft, welcome: `${DRAFT}welcome` }
  const pubDesign = published && {
    ...published.design,
    widgets: published.design.widgets.map((w, i) =>
      i === 0 ? { ...w, hidden: true, content: { type: 'text' as const, heading: `${HIDDEN}h`, text: `${HIDDEN}t` } } : w,
    ),
  }
  return { ...p, web: { ...p.web, draft, ...(pubDesign ? { published: { ...published!, design: pubDesign } } : {}) } }
}

describe('Web Atelier privacy (Task A/B)', () => {
  // W1: visitors and exports get the published design only; draft edits and hidden widgets never leak.
  it('W1: an export never contains draft-only text or hidden widgets (when a design is published)', () => {
    fc.assert(
      fc.property(projectArb.filter((p) => !!p.web.published && p.web.published.design.widgets.length > 0), (raw) => {
        const p = mark(raw)
        const files = unzipSync(exportSite(p))
        for (const [name, data] of Object.entries(files)) {
          if (name.startsWith('assets/') || name.startsWith('audio/') || /^button\./.test(name)) continue
          const text = dec.decode(data)
          expect(text, name).not.toContain(DRAFT)
          expect(text, name).not.toContain(HIDDEN)
        }
      }),
      { numRuns: 60 },
    )
  })

  // W2: the public projection carries exactly one design, and it references only public entries.
  it('W2: the public design references only public entries and only images it ships', () => {
    fc.assert(
      fc.property(projectArb, (p) => {
        const pub = publicProjection(p)
        const publicIds = new Set(pub.posts.map((x) => x.id))
        const assetIds = new Set(pub.assets.map((a) => a.id))
        const d = pub.web.draft
        if (pub.web.published) expect(pub.web.published.design).toEqual(d)
        for (const w of d.widgets) {
          expect(w.hidden).toBe(false)
          if (w.content.type === 'diary') for (const id of w.content.postIds) expect(publicIds.has(id)).toBe(true)
        }
        for (const a of d.assets) expect(assetIds.has(a.id)).toBe(true)
        // A private entry's photo is never shipped unless a public entry or the design uses it.
        const privatePhotos = p.posts.filter((x) => x.visibility === 'private').flatMap((x) => x.imageIds)
        const publicPhotos = new Set(pub.posts.flatMap((x) => x.imageIds))
        const designAssets = new Set(d.assets.map((a) => a.id))
        for (const id of privatePhotos) if (!publicPhotos.has(id) && !designAssets.has(id)) expect(assetIds.has(id)).toBe(false)
      }),
      { numRuns: 150 },
    )
  })
})
