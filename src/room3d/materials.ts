import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { FloorId, WallId } from '../core/room.ts'

export const WALL_COLORS: Record<WallId, string> = {
  cream: '#e7dac2',
  sage: '#a2ae9c',
  blush: '#d7bab0',
  sky: '#abc1cd',
  plum: '#a49aac',
}

export const WALL_SWATCH = WALL_COLORS

export const FLOOR_SWATCH: Record<FloorId, string> = {
  oak: '#b8844f',
  walnut: '#63412c',
  tile: '#d3ccbd',
  checker: '#82958a',
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


/**
 * A fine, low-contrast sprig print. The old version was four big stamps per tile, which read as wallpaper
 * in a doll house. This one runs at roughly twice the frequency and half the contrast, so from the camera
 * it reads as printed paper and only resolves when you lean in — which is what the reference rooms do.
 */
export function sprigWallpaper(){
  return canvasTex((g,size)=>{
    g.fillStyle='#fffaf2';g.fillRect(0,0,size,size)
    // paper grain, so the wall is never a flat fill under the key light
    for(let i=0;i<5200;i++){
      const x=Math.random()*size,y=Math.random()*size
      g.fillStyle=`rgba(${170+Math.random()*40},${160+Math.random()*40},${140+Math.random()*40},.05)`
      g.fillRect(x,y,1.4,1.4)
    }
    const step=64
    for(let row=-1;row<10;row++)for(let col=-1;col<10;col++){
      const x=col*step+(row%2)*step/2,y=row*step
      g.save();g.translate(x,y);g.rotate(((row+col)%3-1)*.22)
      g.strokeStyle='#cfc8b4';g.lineWidth=.9
      g.beginPath();g.moveTo(-3,14);g.bezierCurveTo(6,6,-4,-2,4,-11);g.stroke()
      for(let j=0;j<4;j++){
        const side=j%2?-1:1
        g.fillStyle=j%2?'#d8d2bd':'#c6c9b4'
        g.beginPath();g.ellipse(side*3,9-j*4,3.2,1.2,side*-.65,0,Math.PI*2);g.fill()
      }
      g.fillStyle='#d6b7ab'
      for(let j=0;j<4;j++){const a=j*Math.PI/2+.4;g.beginPath();g.ellipse(3.6+1.5*Math.cos(a),-9+1.5*Math.sin(a),1.3,1,a,0,Math.PI*2);g.fill()}
      g.restore()
    }
  },1)
}
