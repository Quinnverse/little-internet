// Measures how big the review glbs are as exported and after quantization (KHR_mesh_quantization).
// usage: node scripts/assets/glb-sizes.mjs [dir=assets/review/glb]
import { NodeIO } from '@gltf-transform/core'
import { KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, prune, quantize } from '@gltf-transform/functions'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'assets/review/glb'
const io = new NodeIO().registerExtensions([KHRMeshQuantization])
let raw = 0
let packed = 0
const rows = []
for (const f of readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
  const p = join(dir, f)
  const before = statSync(p).size
  const doc = await io.read(p)
  await doc.transform(dedup(), prune(), quantize())
  const after = (await io.writeBinary(doc)).byteLength
  raw += before
  packed += after
  rows.push([f, before, after])
}
const kb = (n) => `${(n / 1024).toFixed(0)} KB`
console.log(`models: ${rows.length}`)
console.log(`as exported: ${kb(raw)}   quantized: ${kb(packed)}`)
const assembled = rows.filter(([f]) => /^(room|exterior)_/.test(f))
const parts = rows.filter(([f]) => !/^(room|exterior)_/.test(f))
console.log(`assembled scenes (4): ${kb(assembled.reduce((a, r) => a + r[1], 0))} -> ${kb(assembled.reduce((a, r) => a + r[2], 0))}`)
console.log(`individual models (${parts.length}): ${kb(parts.reduce((a, r) => a + r[1], 0))} -> ${kb(parts.reduce((a, r) => a + r[2], 0))}`)
console.log('largest:', rows.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, a, b]) => `${f} ${kb(a)}->${kb(b)}`).join(', '))
