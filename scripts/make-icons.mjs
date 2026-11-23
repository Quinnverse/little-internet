// Renders the ghost app icon as PNGs without any image library (PWA install needs PNGs).
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { zlibSync } from 'fflate'

const BG = [0x2b, 0x21, 0x40]
const GHOST = [0xf7, 0xf3, 0xff]

function inGhost(u, v) {
  // Coordinates in the 64-unit SVG space.
  const eye = (cx) => (u - cx) ** 2 + (v - 29) ** 2 <= 9
  if (eye(26) || eye(38) || ((u - 32) / 3) ** 2 + ((v - 38) / 2.2) ** 2 <= 1) return false
  if (u < 16 || u > 48) return false
  if (v < 28) return (u - 32) ** 2 + (v - 28) ** 2 <= 256
  // Wavy hem: 6 teeth between y=50 and 54.
  const t = ((u - 16) / 32) * 6
  const frac = t - Math.floor(t)
  const hem = 50 + 4 * Math.abs(1 - 2 * frac)
  return v <= hem
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function png(size, padding) {
  const raw = new Uint8Array(size * (size * 3 + 1))
  const SS = 4 // supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const u = (((x + (sx + 0.5) / SS) / size) * 64 - 32) / (1 - padding) + 32
          const v = (((y + (sy + 0.5) / SS) / size) * 64 - 32) / (1 - padding) + 32
          if (inGhost(u, v)) hits++
        }
      const a = hits / (SS * SS)
      const o = y * (size * 3 + 1) + 1 + x * 3
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - a) + GHOST[i] * a)
    }
  }
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, size)
  dv.setUint32(4, size)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const file = new Uint8Array(total)
  let off = 0
  for (const p of parts) file.set(p, (off += p.length) - p.length)
  return file
}

// 20% padding keeps the ghost inside the maskable safe zone.
writeFileSync('public/icon-192.png', png(192, 0.2))
writeFileSync('public/icon-512.png', png(512, 0.2))
console.log('wrote public/icon-192.png, public/icon-512.png')
