// Simplifies raw Hunyuan3D meshes (assets/raw/*.glb, ~20 MB) into small props (assets/models/*.glb).
// usage: node scripts/assets/optimize.mjs [kind ...]   (env TRIS=3000 sets the triangle budget)
import { NodeIO } from '@gltf-transform/core'
import { dedup, prune, simplify, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const raw = 'assets/raw'
const out = 'assets/models'
const budget = Number(process.env.TRIS ?? 3000)
mkdirSync(out, { recursive: true })
await MeshoptSimplifier.ready
const io = new NodeIO()
const kinds = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(raw).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4))

for (const kind of kinds) {
  const src = join(raw, `${kind}.glb`)
  if (!existsSync(src)) {
    console.log(`${kind}: no raw mesh, skipped`)
    continue
  }
  const doc = await io.read(src)
  await doc.transform(weld({ tolerance: 0.0005 }))
  const count = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0)
  const before = count()
  const ratio = Math.min(1, budget / Math.max(before, 1))
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }), dedup(), prune())
  // textures and extra attributes are not needed: colour is applied in the app
  for (const t of doc.getRoot().listTextures()) t.dispose()
  const dest = join(out, `${kind}.glb`)
  await io.write(dest, doc)
  console.log(`${kind}: ${Math.round(before)} -> ${Math.round(count())} triangles, ${Math.round(statSync(dest).size / 1024)} KB`)
}
