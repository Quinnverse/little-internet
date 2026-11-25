import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportSite } from '../src/core/exportZip.ts'
import { parseProject } from '../src/core/schema.ts'
import { buildDemo, demoCopy, DEMO_IDS } from '../src/demo/homes.ts'

const dec = new TextDecoder()
const BASE = 'https://little.example/'

describe('demo homes', () => {
  it.each(DEMO_IDS)('%s is a valid, published, editable project', (id) => {
    const p = buildDemo(id, BASE)
    expect(parseProject(p).ok).toBe(true)
    expect(p.site.demo).toBe(true)
    expect(p.web.published?.design).toEqual(p.web.draft)
    expect(p.posts.some((x) => x.visibility === 'private')).toBe(true)
    expect(p.room.memory.length).toBeGreaterThan(0)
  })

  it.each(DEMO_IDS)('%s exports without its private entry and with the demo label', (id) => {
    const p = buildDemo(id, BASE)
    const files = unzipSync(exportSite(p, { baseUrl: `${BASE}@${id}/` }))
    const text = Object.entries(files).filter(([n]) => !n.startsWith('assets/')).map(([, b]) => dec.decode(b)).join('\n')
    for (const priv of p.posts.filter((x) => x.visibility === 'private')) expect(text).not.toContain(priv.title)
    expect(dec.decode(files['index.html']!)).toContain('Demo home')
    expect(Object.keys(files)).toContain('button.png')
  })

  it('the three demo designs look different (style, background, fonts)', () => {
    const t = DEMO_IDS.map((id) => buildDemo(id, BASE).web.draft)
    expect(new Set(t.map((d) => d.style)).size).toBe(3)
    expect(new Set(t.map((d) => d.tokens.bg)).size).toBe(3)
    expect(new Set(t.map((d) => d.tokens.headingFont)).size).toBe(3)
  })

  it('a sandbox copy cannot overwrite the public demo address', () => {
    for (const id of DEMO_IDS) {
      const c = demoCopy(id, BASE)
      expect(parseProject(c).ok).toBe(true)
      expect(c.site.slug).not.toBe(id)
      expect(c.site.demo).toBeUndefined()
      expect(c.web.published).toBeUndefined()
    }
  })
})
