// Turns the approved Blender models (assets/review/glb) into the small, quantized set the app embeds
// (assets/models). Run `node scripts/pack-models.mjs` afterwards (or `npm run assets:kit`, which does both).
import { NodeIO } from '@gltf-transform/core'
import { KHRMaterialsEmissiveStrength, KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, prune, quantize } from '@gltf-transform/functions'
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Everything the room, the visitor entrance and the owner's decor/keepsake pickers use.
export const KIT = [
  'cabin_room_shell', 'villa_room_shell', 'cabin_exterior', 'villa_exterior',
  'desk', 'office_chair', 'bookshelf', 'dresser', 'side_table', 'pet_bed', 'rug',
  'computer', 'keyboard_mouse', 'diary', 'desk_lamp', 'pen_cup', 'mug', 'answering_machine', 'rotary_phone',
  'record_player', 'lava_lamp', 'cd_disc', 'photo_wall', 'wall_clock', 'calendar', 'stickers',
  'plant', 'cactus', 'floor_lamp', 'armchair', 'stool', 'basket', 'mini_bookcase',
  'keepsake_shell', 'keepsake_candle', 'keepsake_book', 'keepsake_flower_vase', 'keepsake_cassette',
  'keepsake_postcard', 'keepsake_photo_frame', 'keepsake_ticket',
  'pet_ghost',
]

const src = process.argv[2] ?? 'assets/review/glb'
const out = 'assets/models'
mkdirSync(out, { recursive: true })
for (const f of readdirSync(out)) if (f.endsWith('.glb')) rmSync(join(out, f))
const io = new NodeIO().registerExtensions([KHRMeshQuantization, KHRMaterialsEmissiveStrength])
let total = 0
for (const name of KIT) {
  const p = join(src, `${name}.glb`)
  if (!existsSync(p)) throw new Error(`missing ${p}`)
  const doc = await io.read(p)
  await doc.transform(dedup(), prune({ keepLeaves: true }), quantize())
  const dest = join(out, `${name}.glb`)
  await io.write(dest, doc)
  total += statSync(dest).size
}
console.log(`kit: ${KIT.length} models, ${(total / 1024).toFixed(0)} KB (before base64)`)
