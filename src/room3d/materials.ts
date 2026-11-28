import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { FloorId, WallId } from '../core/room.ts'

export const WALL_COLORS: Record<WallId, string> = {
  cream: '#e7dac2',
  sage: '#a8a794',
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
  const base = id === 'oak' ? [198, 146, 90] : [120, 80, 52]
  return canvasTex((g, s) => {
    const planks = 6
    const ph = s / planks
    for (let i = 0; i < planks; i++) {
      // Per-board tint rather than the same fill shifted a little: real floors drift in hue.
      const dv = ((i * 37) % 13) - 6
      const dh = ((i * 61) % 9) - 4
      g.fillStyle = `rgb(${base[0]! + dv * 3 + dh},${base[1]! + dv * 2},${base[2]! + dv * 2 - dh})`
      g.fillRect(0, i * ph, s, ph)

      // grain: long wobbling fibres, in bunches, so the boards read as cut timber
      for (let k = 0; k < 26; k++) {
        const y0 = i * ph + ((k * 29 + i * 17) % (ph - 4)) + 2
        g.strokeStyle = k % 3 === 0 ? 'rgba(74,42,16,.10)' : 'rgba(255,226,186,.07)'
        g.lineWidth = k % 3 === 0 ? 1.6 : 1
        g.beginPath()
        g.moveTo(0, y0)
        for (let x = 0; x <= s; x += s / 8) g.lineTo(x, y0 + Math.sin((x / s) * 6.2 + i * 2.1 + k) * 1.7)
        g.stroke()
      }
      // one knot per board at most, mostly near the joint where it would fall in real stock
      if (i % 2 === 0) {
        const kx = ((i * 137) % 7) * (s / 7) + 20
        const ky = i * ph + ph * 0.55
        for (let r = 3; r < 12; r += 2.2) {
          g.strokeStyle = `rgba(70,38,14,${0.16 - r * 0.008})`
          g.lineWidth = 1.2
          g.beginPath()
          g.ellipse(kx, ky, r * 1.9, r, 0.25, 0, Math.PI * 2)
          g.stroke()
        }
      }

      // bevel: a lit lip on the top edge, a contact shadow under the bottom one
      g.fillStyle = 'rgba(255,238,210,.16)'
      g.fillRect(0, i * ph + 1, s, 2.4)
      g.fillStyle = 'rgba(46,24,8,.30)'
      g.fillRect(0, i * ph + 3.4, s, 2)
      g.fillStyle = 'rgba(34,16,4,.42)'
      g.fillRect(0, (i + 1) * ph - 3, s, 3)

      // butt joint
      const jx = (((i * 97) % 5) + 1) * (s / 6)
      g.fillStyle = 'rgba(40,20,6,.34)'
      g.fillRect(jx, i * ph, 2.2, ph)
      g.fillStyle = 'rgba(255,236,205,.10)'
      g.fillRect(jx + 2.2, i * ph, 1.2, ph)
    }
    // dust and wear, tighter in the seams
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 40},${Math.random() > 0.5 ? 226 : 26},${Math.random() > 0.5 ? 200 : 12},.035)`
      g.fillRect(x, y, 1.6, 1.2)
    }
  }, 3)
}

/** Roughness companion for the floor: seams and grain catch the light differently from the boards. */
export function floorRoughness(id: FloorId): THREE.CanvasTexture {
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.fillStyle = '#b4b4b4'
  g.fillRect(0, 0, s, s)
  const planks = id === 'oak' || id === 'walnut' ? 6 : 2
  const ph = s / planks
  for (let i = 0; i < planks; i++) {
    g.fillStyle = `rgba(${150 + (i % 3) * 22},${150 + (i % 3) * 22},${150 + (i % 3) * 22},1)`
    g.fillRect(0, i * ph, s, ph * 0.9)
    g.fillStyle = 'rgba(90,90,90,.9)'
    g.fillRect(0, i * ph + ph * 0.9, s, ph * 0.1)
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(60,60,60,.06)'
    g.fillRect(Math.random() * s, Math.random() * s, 2, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 3)
  t.anisotropy = 4
  return t
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
 * Painted-paper wall. The previous version dropped a sprig motif every six centimetres, which at camera
 * distance turned into the dashed mush you see in a generated texture. This one is built the other way
 * round: it is a plaster surface first (mottle, roller streaks, grain) and a very quiet print second,
 * with the motif spaced at roughly thirty centimetres and roughly half the contrast.
 */
export function plasterWallpaper(){
  return canvasTex((g,size)=>{
    g.fillStyle='#fbf7ef';g.fillRect(0,0,size,size)
    // large soft mottle: uneven paint absorption
    for(let i=0;i<150;i++){
      const x=Math.random()*size,y=Math.random()*size,r=90+Math.random()*260
      const grd=g.createRadialGradient(x,y,0,x,y,r)
      const dark=Math.random()>0.45
      grd.addColorStop(0,`rgba(${dark?176:255},${dark?166:250},${dark?146:236},.02)`)
      grd.addColorStop(1,'rgba(0,0,0,0)')
      g.fillStyle=grd;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill()
    }
    // roller streaks, faintly vertical
    for(let i=0;i<20;i++){
      const x=Math.random()*size,w=40+Math.random()*140
      g.fillStyle=`rgba(196,186,166,${0.005+Math.random()*0.007})`
      g.fillRect(x,0,w,size)
    }
    // paper grain
    for(let i=0;i<7000;i++){
      const x=Math.random()*size,y=Math.random()*size
      g.fillStyle=`rgba(${168+Math.random()*44},${158+Math.random()*44},${138+Math.random()*44},.028)`
      g.fillRect(x,y,1.4,1.4)
    }
    // quiet sprig print, half drop, ~30 cm apart given the shader's 1.19 m tile
    const step=192
    for(let row=-1;row<6;row++)for(let col=-1;col<6;col++){
      const x=col*step+(row%2)*step/2,y=row*step
      g.save();g.translate(x,y);g.rotate(((row+col)%3-1)*.22);g.scale(1.45,1.45)
      g.strokeStyle='rgba(199,191,168,.3)';g.lineWidth=.8
      g.beginPath();g.moveTo(-3,14);g.bezierCurveTo(6,6,-4,-2,4,-11);g.stroke()
      for(let j=0;j<4;j++){
        const side=j%2?-1:1
        g.fillStyle=j%2?'rgba(212,206,184,.24)':'rgba(190,195,170,.22)'
        g.beginPath();g.ellipse(side*3,9-j*4,3.2,1.2,side*-.65,0,Math.PI*2);g.fill()
      }
      g.fillStyle='rgba(206,178,166,.18)'
      for(let j=0;j<4;j++){const a=j*Math.PI/2+.4;g.beginPath();g.ellipse(3.6+1.5*Math.cos(a),-9+1.5*Math.sin(a),1.3,1,a,0,Math.PI*2);g.fill()}
      g.restore()
    }
  },1)
}
/** Linen weave: fine crossing threads plus slubs, near white so it only tints what it covers. */
export function weaveTexture(): THREE.CanvasTexture {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.fillStyle = '#f6f0e7'
  g.fillRect(0, 0, s, s)
  // Threads, not a chequerboard: one pixel line every 8px, warp lighter than weft.
  for (let i = 0; i < s; i += 8) {
    g.fillStyle = 'rgba(255,253,246,.30)'
    g.fillRect(0, i, s, 1)
    g.fillStyle = 'rgba(196,180,160,.22)'
    g.fillRect(0, i + 1, s, 1)
    g.fillStyle = 'rgba(255,252,244,.20)'
    g.fillRect(i, 0, 1, s)
    g.fillStyle = 'rgba(186,170,150,.16)'
    g.fillRect(i + 1, 0, 1, s)
  }
  // slubs and stray fibres break the regularity
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * s
    const y = Math.random() * s
    g.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,250,.20)' : 'rgba(150,134,116,.13)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 4 + Math.random() * 16, y + (Math.random() - 0.5) * 1.6)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

/** Fine timber grain for the modelled furniture, which otherwise renders as flat painted wood. */
export function woodDetailTexture(): THREE.CanvasTexture {
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.fillStyle = '#f6efe4'
  g.fillRect(0, 0, s, s)
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * s
    const amp = 1 + Math.random() * 3
    g.strokeStyle = Math.random() > 0.4 ? 'rgba(120,86,56,.10)' : 'rgba(255,246,228,.10)'
    g.lineWidth = 0.8 + Math.random() * 1.6
    g.beginPath()
    for (let x = 0; x <= s; x += s / 10) g.lineTo(x, y + Math.sin(x / s * 8.4 + i) * amp)
    g.stroke()
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 120},${Math.random() > 0.5 ? 246 : 88},${Math.random() > 0.5 ? 226 : 60},.05)`
    g.fillRect(Math.random() * s, Math.random() * s, 2, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}
