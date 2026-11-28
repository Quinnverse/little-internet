import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { FloorId, WallId } from '../core/room.ts'

export const WALL_COLORS: Record<WallId, string> = {
  cream: '#f1e3c8',
  sage: '#b6ccae',
  blush: '#eec3bd',
  sky: '#b7d3e6',
  plum: '#b9a2c6',
}

export const WALL_SWATCH = WALL_COLORS

export const FLOOR_SWATCH: Record<FloorId, string> = {
  oak: '#c9965c',
  walnut: '#7b5336',
  tile: '#dcd6c8',
  checker: '#8aa092',
}

export function mat(color: string | number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, ...opts })
}

/** Rounded box. Rounding gives the toy-like, hand-made look of a miniature. */
export function box(
  w: number,
  h: number,
  d: number,
  color: string | number,
  radius = 0.025,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.Mesh {
  const r = Math.min(radius, w / 2.01, h / 2.01, d / 2.01)
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat(color, opts))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export function cyl(rt: number, rb: number, h: number, color: string | number, seg = 24): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export function ball(r: number, color: string | number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color, opts))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export function place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z)
  return o
}

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, repeat: number): THREE.CanvasTexture {
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  draw(g, s)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  return t
}

/** Floor surface drawn on a canvas, so there are no image files to ship. */
export function floorTexture(id: FloorId): THREE.CanvasTexture {
  if (id === 'checker') {
    return canvasTex((g, s) => {
      const n = 4
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = (x + y) % 2 ? '#7f9788' : '#e7dfd0'
          g.fillRect((x * s) / n, (y * s) / n, s / n, s / n)
        }
    }, 3)
  }
  if (id === 'tile') {
    return canvasTex((g, s) => {
      g.fillStyle = '#e1dbcd'
      g.fillRect(0, 0, s, s)
      g.strokeStyle = '#bdb6a6'
      g.lineWidth = 6
      for (let i = 0; i <= 2; i++) {
        g.strokeRect((i * s) / 2 - 3, -3, s / 2, s + 6)
        g.strokeRect(-3, (i * s) / 2 - 3, s + 6, s / 2)
      }
    }, 3)
  }
  const base = id === 'oak' ? [201, 150, 92] : [123, 83, 54]
  return canvasTex((g, s) => {
    const planks = 6
    for (let i = 0; i < planks; i++) {
      const v = ((i * 37) % 17) - 8
      g.fillStyle = `rgb(${base[0]! + v},${base[1]! + v},${base[2]! + v})`
      g.fillRect(0, (i * s) / planks, s, s / planks)
      g.strokeStyle = 'rgba(60,30,10,.35)'
      g.lineWidth = 3
      g.strokeRect(0, (i * s) / planks, s, s / planks)
      // a few grain lines and one butt joint per plank
      g.strokeStyle = 'rgba(70,40,15,.12)'
      g.lineWidth = 2
      for (let k = 0; k < 4; k++) {
        const y = (i * s) / planks + ((k * 53 + i * 11) % (s / planks - 6)) + 3
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(s, y + ((k % 2) * 2 - 1) * 2)
        g.stroke()
      }
      g.strokeStyle = 'rgba(60,30,10,.35)'
      g.lineWidth = 3
      const jx = (((i * 97) % 5) + 1) * (s / 6)
      g.beginPath()
      g.moveTo(jx, (i * s) / planks)
      g.lineTo(jx, ((i + 1) * s) / planks)
      g.stroke()
    }
  }, 3)
}

/** A soft rounded-square sprite used as a blob shadow and hotspot glow. */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Text (such as the entry title) or an image drawn on a small canvas texture. */
export function labelTexture(lines: string[], bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 192
  const g = c.getContext('2d')!
  g.fillStyle = bg
  g.fillRect(0, 0, 256, 192)
  g.fillStyle = fg
  g.font = '600 26px system-ui, "PingFang SC", "Noto Sans CJK SC", sans-serif'
  g.textAlign = 'center'
  lines.slice(0, 3).forEach((l, i) => g.fillText(l.slice(0, 11), 128, 70 + i * 34))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}


export function sprigWallpaper(){
  return canvasTex((g,size)=>{
    g.fillStyle='#fffaf1';g.fillRect(0,0,size,size)
    for(let row=0;row<4;row++)for(let col=-1;col<4;col++){
      g.save();g.translate(66+col*128+(row%2)*64,64+row*128);g.rotate(((row+col)%3-1)*.29)
      g.strokeStyle='#b6b39d';g.lineWidth=1.3;g.beginPath();g.moveTo(-8,28);g.bezierCurveTo(12,10,-9,-5,8,-22);g.stroke()
      for(let j=0;j<5;j++){
        const side=j%2?-1:1
        g.fillStyle=j%2?'#c5c6aa':'#aebda7';g.beginPath();g.ellipse(side*5,18-j*8,6,2.4,side*-.65,0,Math.PI*2);g.fill()
      }
      for(let j=0;j<5;j++){const a=j*2*Math.PI/5;g.fillStyle='#d4afa3';g.beginPath();g.ellipse(7+3*Math.cos(a),-19+3*Math.sin(a),2.6,2,a,0,Math.PI*2);g.fill()}
      g.restore()
    }
  },1)
}
