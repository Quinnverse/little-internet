import { exportSite } from '../core/exportZip.ts'
import type { Project } from '../core/schema.ts'
import { setWebring } from '../editor/commands.ts'
import { buildDemo, DEMO_IDS, type DemoId } from './homes.ts'

/**
 * Publishes the demo homes to a Little Internet server through the normal publishing API, joins
 * each to the webring, then republishes with the ring links. `keys` holds one owner key per demo
 * (kept by the operator, never committed). Missing keys are created and returned.
 */
export async function seedDemos(server: string, keys: Partial<Record<DemoId, string>>, log = console.log): Promise<Record<DemoId, string>> {
  const root = server.replace(/\/+$/, '')
  const base = `${root}/`
  const out = { ...keys } as Record<DemoId, string>
  const newKey = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const call = async (path: string, init: RequestInit) => {
    const r = await fetch(`${root}${path}`, init)
    if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${r.status} ${await r.text()}`)
    return r.json() as Promise<Record<string, unknown>>
  }
  const put = (p: Project, key: string) =>
    call(`/api/sites/${p.site.slug}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/zip' },
      body: exportSite(p, { baseUrl: `${base}@${p.site.slug}/` }) as BodyInit,
    })

  for (const id of DEMO_IDS) {
    out[id] ??= newKey()
    let p = buildDemo(id, base)
    await put(p, out[id])
    const j = await call(`/api/sites/${id}/ring`, { method: 'PUT', headers: { Authorization: `Bearer ${out[id]}` } })
    p = setWebring(j.links as Project['webring'])(p)
    await put(p, out[id])
    log(`published ${base}@${id}/`)
  }
  return out
}
