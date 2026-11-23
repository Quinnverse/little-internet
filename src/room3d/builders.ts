import * as THREE from 'three'
import type { DecorKind, FloorId, House, MemoryKind, WallId } from '../core/room.ts'
import { ball, box, cyl, floorTexture, labelTexture, mat, place, WALL_COLORS } from './materials.ts'

export type BuildCtx = {
  /** Warm lights that are only on when it is dark. */
  lamps: THREE.PointLight[]
  /** Emissive things that should be dimmer in daylight (screens, flames). */
  glows: { mat: THREE.MeshStandardMaterial; day: number; night: number }[]
}

const WOOD = '#b57d4a'
const WOOD_LIGHT = '#d09a62'
const WOOD_DARK = '#7d5233'

function pick<T extends THREE.Object3D>(o: T, id: string): T {
  o.userData.pick = id
  return o
}

function shadowAll(o: THREE.Object3D, cast = true, receive = true) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast
      c.receiveShadow = receive
    }
  })
}

function addLamp(ctx: BuildCtx, parent: THREE.Object3D, x: number, y: number, z: number, intensity: number, color = '#ffc98a', dist = 5): THREE.PointLight {
  const l = new THREE.PointLight(color, intensity, dist, 1.6)
  l.position.set(x, y, z)
  l.userData.base = intensity
  parent.add(l)
  ctx.lamps.push(l)
  return l
}

function glowMat(ctx: BuildCtx, color: string, day: number, night: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: night, roughness: 0.6 })
  ctx.glows.push({ mat: m, day, night })
  return m
}

// ---------------------------------------------------------------- shell

export type Wall = {
  group: THREE.Group
  /** World direction pointing into the room. */
  inward: THREE.Vector3
  /** A point on the wall's inner face, used to decide which side the camera is on. */
  point: THREE.Vector3
  mats: THREE.Material[]
  alpha: number
}

export type Shell = {
  group: THREE.Group
  walls: Wall[]
  doorPivot: THREE.Group
  floor: THREE.Mesh
}

const WALL_H = 3.1
const WALL_T = 0.16
type Hole = { a0: number; a1: number; y0: number; y1: number }

/**
 * One wall in local space: runs along local +x for 6 units, thickness toward local -z,
 * inward is local +z. Optional rectangular hole.
 */
function makeWall(color: string, trim: string, hole?: Hole, ext = false): THREE.Group {
  const g = new THREE.Group()
  const wm = () => mat(color, { roughness: 0.95 })
  const seg = (a0: number, a1: number, y0: number, y1: number) => {
    if (a1 - a0 < 1e-3 || y1 - y0 < 1e-3) return
    const b = box(a1 - a0, y1 - y0, WALL_T, color, 0.01)
    b.material = wm()
    b.position.set((a0 + a1) / 2, (y0 + y1) / 2, -WALL_T / 2)
    g.add(b)
  }
  // `ext` extends the wall over the neighbouring wall's thickness so the corner is closed.
  const a = ext ? -WALL_T : 0
  const o = 0.004 // tiny overlap hides seams between segments
  if (hole) {
    seg(a, hole.a0 + o, 0, WALL_H)
    seg(hole.a1 - o, 6, 0, WALL_H)
    seg(hole.a0, hole.a1, 0, hole.y0 + o)
    seg(hole.a0, hole.a1, hole.y1 - o, WALL_H)
  } else {
    seg(a, 6, 0, WALL_H)
  }
  // Top cap and baseboard.
  const cap = box(6.06 - a, 0.1, WALL_T + 0.08, trim, 0.03)
  cap.position.set(3 + a / 2, WALL_H + 0.03, -WALL_T / 2)
  g.add(cap)
  const base = box(6, 0.14, 0.05, trim, 0.015)
  base.position.set(3, 0.07, 0.025)
  g.add(base)
  return g
}

function collectMats(g: THREE.Object3D): THREE.Material[] {
  const out = new Set<THREE.Material>()
  g.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (!m) return
    for (const x of Array.isArray(m) ? m : [m]) out.add(x)
  })
  return [...out]
}

export function buildShell(house: House, wallId: WallId, floorId: FloorId, ctx: BuildCtx): Shell {
  const group = new THREE.Group()
  const wallColor = WALL_COLORS[wallId]
  const villa = house === 'villa'
  const trim = villa ? '#f6f3ec' : WOOD_DARK
  const slab = villa ? '#d8d4cb' : '#8c6a4b'

  // Floor slab and surface.
  const base = box(6.5, 0.4, 6.5, slab, 0.05)
  base.position.set(3, -0.2, 3)
  group.add(base)
  const tex = floorTexture(floorId)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(3, 0.002, 3)
  floor.receiveShadow = true
  group.add(floor)

  const walls: Wall[] = []

  // Back wall (z = 0), window hole.
  const winHole: Hole = villa ? { a0: 2.2, a1: 4.0, y0: 0.9, y1: 2.6 } : { a0: 2.6, a1: 3.8, y0: 1.0, y1: 2.4 }
  const back = makeWall(wallColor, trim, winHole, true)
  group.add(back)
  const winW = winHole.a1 - winHole.a0
  const winH = winHole.y1 - winHole.y0
  const winCx = (winHole.a0 + winHole.a1) / 2
  const winCy = (winHole.y0 + winHole.y1) / 2
  const frameMat = () => mat(villa ? '#f6f3ec' : '#e8d9bb', { roughness: 0.6 })
  const mk = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const b = box(w, h, d, '#ffffff', 0.01)
    b.material = frameMat()
    b.position.set(x, y, z)
    back.add(b)
  }
  const ft = 0.07
  mk(winW + ft * 2, ft, 0.2, winCx, winHole.y1 + ft / 2, -0.05)
  mk(winW + ft * 2, ft, 0.2, winCx, winHole.y0 - ft / 2, -0.05)
  mk(ft, winH, 0.2, winHole.a0 - ft / 2, winCy, -0.05)
  mk(ft, winH, 0.2, winHole.a1 + ft / 2, winCy, -0.05)
  mk(0.04, winH, 0.06, winCx, winCy, -0.08)
  mk(winW, 0.04, 0.06, winCx, winCy, -0.08)
  // Glass.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, winH),
    new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.12, roughness: 0.1 }),
  )
  glass.position.set(winCx, winCy, -0.09)
  glass.castShadow = false
  back.add(glass)
  // Sill inside the room.
  const sill = box(winW + 0.3, 0.05, 0.3, villa ? '#f6f3ec' : '#c9a36d', 0.02)
  sill.position.set(winCx, winHole.y0 + 0.01, 0.13)
  back.add(sill)
  // Curtains (cabin) or a roller blind (villa).
  if (villa) {
    const blind = box(winW + 0.2, 0.22, 0.06, '#e9e5da', 0.02)
    blind.position.set(winCx, winHole.y1 - 0.02, 0.07)
    back.add(blind)
  } else {
    for (const s of [-1, 1]) {
      const c = box(0.3, winH + 0.2, 0.07, '#e3a88f', 0.03)
      c.position.set(winCx + s * (winW / 2 + 0.05), winCy, 0.07)
      back.add(c)
    }
    const rod = cyl(0.02, 0.02, winW + 0.7, WOOD_DARK, 8)
    rod.rotation.z = Math.PI / 2
    rod.position.set(winCx, winHole.y1 + 0.12, 0.1)
    back.add(rod)
  }
  const windowHot = new THREE.Group()
  windowHot.position.set(winCx, winCy, 0.1)
  windowHot.userData.pick = 'window'
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), new THREE.MeshBasicMaterial({ visible: false }))
  windowHot.add(hit)
  back.add(windowHot)
  walls.push({ group: back, inward: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(3, 1, 0), mats: collectMats(back), alpha: 1 })

  // Left wall (x = 0): local x runs toward world -z, so it is placed at z = 6.
  const doorA0 = 1.05
  const doorA1 = 1.95 // local; world z = 6 - local → 4.05 .. 4.95
  const doorH = 2.15
  const left = makeWall(wallColor, trim, { a0: doorA0, a1: doorA1, y0: 0, y1: doorH })
  left.rotation.y = Math.PI / 2
  left.position.set(0, 0, 6)
  group.add(left)
  // Door frame and leaf (leaf pivots at the hinge).
  const frameM = () => mat(villa ? '#f6f3ec' : WOOD_DARK, { roughness: 0.6 })
  for (const [w, h, x, y] of [
    [0.07, doorH, doorA0 - 0.035, doorH / 2],
    [0.07, doorH, doorA1 + 0.035, doorH / 2],
    [doorA1 - doorA0 + 0.14, 0.07, (doorA0 + doorA1) / 2, doorH + 0.035],
  ] as const) {
    const f = box(w, h, 0.22, '#ffffff', 0.01)
    f.material = frameM()
    f.position.set(x, y, -0.05)
    left.add(f)
  }
  const doorPivot = new THREE.Group()
  // Hinge at local x = doorA0 (world z = 4.95), inside the wall thickness.
  doorPivot.position.set(doorA0, 0, -WALL_T / 2)
  const leaf = box(doorA1 - doorA0, doorH - 0.02, 0.06, villa ? '#7fa3a1' : '#a1693b', 0.02)
  leaf.position.set((doorA1 - doorA0) / 2, (doorH - 0.02) / 2, 0)
  doorPivot.add(leaf)
  const knob = ball(0.045, '#e8c15a')
  knob.position.set(doorA1 - doorA0 - 0.12, 1.0, 0.06)
  doorPivot.add(knob)
  const knob2 = ball(0.045, '#e8c15a')
  knob2.position.set(doorA1 - doorA0 - 0.12, 1.0, -0.06)
  doorPivot.add(knob2)
  const panel = box(0.55, 0.9, 0.02, villa ? '#6b908e' : '#8c5830', 0.01)
  panel.position.set((doorA1 - doorA0) / 2, 1.3, 0.04)
  doorPivot.add(panel)
  const panel2 = box(0.55, 0.6, 0.02, villa ? '#6b908e' : '#8c5830', 0.01)
  panel2.position.set((doorA1 - doorA0) / 2, 0.55, 0.04)
  doorPivot.add(panel2)
  doorPivot.userData.pick = 'door'
  left.add(doorPivot)
  // Doormat inside.
  const mt = box(0.7, 0.02, 0.9, '#b5614a', 0.01)
  mt.position.set(0.55, 0.011, 4.5)
  group.add(mt)
  walls.push({ group: left, inward: new THREE.Vector3(1, 0, 0), point: new THREE.Vector3(0, 1, 3), mats: collectMats(left), alpha: 1 })

  // Front (z = 6) and right (x = 6) walls: plain, only visible from behind the room.
  const front = makeWall(wallColor, trim, undefined, true)
  front.rotation.y = Math.PI
  front.position.set(6, 0, 6)
  group.add(front)
  walls.push({ group: front, inward: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(3, 1, 6), mats: collectMats(front), alpha: 1 })
  const right = makeWall(wallColor, trim)
  right.rotation.y = -Math.PI / 2
  right.position.set(6, 0, 0)
  group.add(right)
  walls.push({ group: right, inward: new THREE.Vector3(-1, 0, 0), point: new THREE.Vector3(6, 1, 3), mats: collectMats(right), alpha: 1 })

  // Wall materials fade; keep shadows even when faded so light stays consistent.
  for (const w of walls) {
    for (const m of w.mats) m.transparent = true
    w.group.traverse((c) => {
      if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type !== 'PlaneGeometry') c.castShadow = true
    })
  }
  void ctx
  return { group, walls, doorPivot, floor }
}

// ---------------------------------------------------------------- built-in furniture

function screenTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 192
  const g = c.getContext('2d')!
  g.fillStyle = '#3b7fb5'
  g.fillRect(0, 0, 256, 192)
  g.fillStyle = '#ece8d8'
  g.fillRect(10, 10, 236, 172)
  g.fillStyle = '#2a4d9b'
  g.fillRect(10, 10, 236, 22)
  g.fillStyle = '#fff'
  g.font = 'bold 15px monospace'
  g.fillText('home.html', 18, 26)
  g.fillStyle = '#d6496b'
  g.font = 'bold 26px "Comic Sans MS", cursive, sans-serif'
  g.fillText('~ my little corner ~', 22, 66)
  const cols = ['#f7c948', '#7ac7a1', '#e98ca0', '#79a8e8']
  for (let i = 0; i < 4; i++) {
    g.fillStyle = cols[i]!
    g.fillRect(22 + i * 56, 86, 46, 38)
  }
  g.fillStyle = '#2a4d9b'
  g.font = '14px monospace'
  g.fillText('visitors: you!  [guestbook]', 22, 150)
  g.fillStyle = '#d6496b'
  g.fillRect(22, 160, 80, 12)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function buildDesk(ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group()
  const top = box(1.94, 0.05, 0.86, WOOD_LIGHT, 0.02)
  top.position.set(1.0, 0.75, 0.47)
  g.add(top)
  for (const x of [0.1, 1.9]) {
    const side = box(0.05, 0.73, 0.78, WOOD, 0.01)
    side.position.set(x, 0.365, 0.45)
    g.add(side)
  }
  const back = box(1.8, 0.4, 0.03, WOOD_DARK, 0.01)
  back.position.set(1.0, 0.5, 0.1)
  g.add(back)
  const drawers = box(0.55, 0.62, 0.74, WOOD, 0.02)
  drawers.position.set(1.6, 0.4, 0.46)
  g.add(drawers)
  for (const y of [0.22, 0.46]) {
    const f = box(0.48, 0.2, 0.02, WOOD_LIGHT, 0.01)
    f.position.set(1.6, y, 0.84)
    g.add(f)
    const k = ball(0.025, '#e8c15a')
    k.position.set(1.6, y, 0.865)
    g.add(k)
  }

  // Retro computer (opens the website).
  const pc = new THREE.Group()
  const body = box(0.52, 0.44, 0.44, '#dcd3bd', 0.04)
  body.position.set(0, 0.26, 0)
  pc.add(body)
  const stand = box(0.3, 0.05, 0.28, '#cfc6ae', 0.02)
  stand.position.set(0, 0.025, 0.02)
  pc.add(stand)
  const bezel = box(0.44, 0.34, 0.04, '#cdc4ac', 0.03)
  bezel.position.set(0, 0.27, 0.215)
  pc.add(bezel)
  const sm = new THREE.MeshStandardMaterial({ map: screenTexture(), emissiveMap: screenTexture(), emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.35 })
  ctx.glows.push({ mat: sm, day: 0.45, night: 1.1 })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.27), sm)
  screen.position.set(0, 0.27, 0.238)
  pc.add(screen)
  const led = ball(0.012, '#7cf08a', { emissive: '#7cf08a', emissiveIntensity: 1.5 })
  led.position.set(0.17, 0.065, 0.225)
  pc.add(led)
  const kb = box(0.44, 0.03, 0.14, '#dcd3bd', 0.015)
  kb.position.set(0, 0.015, 0.4)
  pc.add(kb)
  for (let i = 0; i < 4; i++) {
    const row = box(0.4, 0.012, 0.022, '#9a927f', 0.004)
    row.position.set(0, 0.036, 0.36 + i * 0.03)
    pc.add(row)
  }
  const mouse = box(0.06, 0.025, 0.09, '#dcd3bd', 0.02)
  mouse.position.set(0.34, 0.013, 0.4)
  pc.add(mouse)
  pc.position.set(1.4, 0.775, 0.3)
  pc.rotation.y = 0.12
  pick(pc, 'computer')
  g.add(pc)
  addLamp(ctx, pc, 0, 0.3, 0.6, 0.35, '#9cc7ff', 2.2)

  // Diary (opens the writing sheet).
  const diary = new THREE.Group()
  const cover = box(0.5, 0.045, 0.37, '#c25b4a', 0.02)
  diary.add(cover)
  const pages = box(0.46, 0.03, 0.33, '#f6efdc', 0.01)
  pages.position.set(0.012, 0.035, 0)
  diary.add(pages)
  const band = box(0.04, 0.052, 0.375, '#e3b34f', 0.005)
  band.position.set(0.2, 0.002, 0)
  diary.add(band)
  const ribbon = box(0.012, 0.004, 0.14, '#e8c15a', 0.002)
  ribbon.position.set(-0.05, 0.052, 0.25)
  diary.add(ribbon)
  const pen = cyl(0.01, 0.01, 0.22, '#2f5d8a', 10)
  pen.rotation.z = Math.PI / 2
  pen.rotation.y = 0.5
  pen.position.set(0.1, 0.06, 0.12)
  diary.add(pen)
  diary.position.set(0.62, 0.8, 0.5)
  diary.rotation.y = 0.18
  pick(diary, 'diary')
  g.add(diary)

  // Desk lamp.
  const lamp = new THREE.Group()
  lamp.add(cyl(0.07, 0.08, 0.03, '#3d4a55'))
  const arm = cyl(0.012, 0.012, 0.36, '#3d4a55', 8)
  arm.position.set(0, 0.2, 0)
  arm.rotation.z = 0.35
  lamp.add(arm)
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.12, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#e8b04a', side: THREE.DoubleSide, emissive: '#ffb347', emissiveIntensity: 0.25 }))
  shade.position.set(-0.12, 0.38, 0)
  shade.rotation.z = 0.5
  shade.castShadow = true
  lamp.add(shade)
  addLamp(ctx, lamp, -0.1, 0.32, 0.02, 1.6, '#ffc98a', 4.5)
  lamp.position.set(0.22, 0.775, 0.22)
  g.add(lamp)
  shadowAll(g)
  return g
}

export function buildChair(): THREE.Group {
  const g = new THREE.Group()
  const seat = box(0.5, 0.08, 0.5, '#6f9a82', 0.04)
  seat.position.y = 0.5
  g.add(seat)
  const back = box(0.5, 0.5, 0.07, '#6f9a82', 0.04)
  back.position.set(0, 0.8, 0.22)
  g.add(back)
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) {
    const l = cyl(0.02, 0.02, 0.48, WOOD_DARK, 8)
    l.position.set(x, 0.24, z)
    g.add(l)
  }
  g.position.set(1.5, 0, 1.55)
  g.rotation.y = 0.25
  shadowAll(g)
  return g
}

export function buildShelf(): THREE.Group {
  const g = new THREE.Group()
  const w = 1.9
  const d = 0.5
  for (const y of [0.05, 0.85, 1.65, 2.5]) {
    const b = box(w, 0.05, d, WOOD, 0.012)
    b.position.set(5, y, d / 2)
    g.add(b)
  }
  for (const x of [4.03, 5.97]) {
    const s = box(0.06, 2.55, d, WOOD_DARK, 0.012)
    s.position.set(x, 1.27, d / 2)
    g.add(s)
  }
  const back = box(w, 2.5, 0.03, '#8f6a47', 0.005)
  back.position.set(5, 1.27, 0.02)
  g.add(back)
  // Fixed decoration: a wicker box and a few spines so an empty shelf still looks lived in.
  const wick = box(0.6, 0.5, 0.36, '#c9a36d', 0.04)
  wick.position.set(4.5, 0.33, 0.28)
  g.add(wick)
  const colors = ['#c95f4a', '#e3b34f', '#5f8fb3', '#7aa57a', '#8d6bb0']
  colors.forEach((c, i) => {
    const b = box(0.07, 0.34 + (i % 3) * 0.04, 0.26, c, 0.01)
    b.position.set(5.55 + i * 0.075, 0.25 + (0.34 + (i % 3) * 0.04) / 2 - 0.2, 0.3)
    g.add(b)
  })
  const topPlant = new THREE.Group()
  topPlant.add(place(cyl(0.1, 0.08, 0.14, '#d98a6c'), 0, 0.07, 0))
  for (let i = 0; i < 5; i++) {
    const l = ball(0.1, i % 2 ? '#5f9d6a' : '#74b27d')
    l.scale.set(0.5, 1.2, 0.5)
    l.position.set(Math.cos(i * 1.25) * 0.09, 0.26, Math.sin(i * 1.25) * 0.09)
    l.rotation.z = Math.cos(i * 1.25) * 0.5
    l.rotation.x = -Math.sin(i * 1.25) * 0.5
    topPlant.add(l)
  }
  topPlant.position.set(4.35, 2.53, 0.26)
  g.add(topPlant)
  shadowAll(g)
  pick(g, 'shelf')
  return g
}

/** Side table with the answering machine and a phone. */
export function buildAnsweringTable(ctx: BuildCtx, hasWelcome: boolean): { group: THREE.Group; led: THREE.MeshStandardMaterial } {
  const g = new THREE.Group()
  const table = new THREE.Group()
  const top = box(0.8, 0.05, 0.8, WOOD_LIGHT, 0.02)
  top.position.set(0.46, 0.62, 2.5)
  table.add(top)
  for (const [x, z] of [[0.12, 2.15], [0.8, 2.15], [0.12, 2.85], [0.8, 2.85]] as const) {
    const l = cyl(0.03, 0.025, 0.6, WOOD_DARK, 8)
    l.position.set(x, 0.3, z)
    table.add(l)
  }
  g.add(table)

  const machine = new THREE.Group()
  const body = box(0.42, 0.12, 0.3, '#d9d0bb', 0.03)
  body.position.y = 0.06
  machine.add(body)
  const deck = box(0.26, 0.012, 0.18, '#2c3640', 0.004)
  deck.position.set(-0.04, 0.125, -0.02)
  machine.add(deck)
  for (const x of [-0.1, 0.02]) {
    const reel = cyl(0.035, 0.035, 0.012, '#eae6da', 16)
    reel.position.set(x, 0.132, -0.02)
    machine.add(reel)
  }
  const ledMat = new THREE.MeshStandardMaterial({ color: '#ff4a4a', emissive: '#ff2a2a', emissiveIntensity: hasWelcome ? 1.6 : 0.05 })
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), ledMat)
  led.position.set(0.16, 0.125, 0.09)
  machine.add(led)
  for (let i = 0; i < 3; i++) {
    const b = box(0.045, 0.02, 0.03, i === 0 ? '#d6496b' : '#6c7a86', 0.006)
    b.position.set(-0.12 + i * 0.07, 0.12, 0.11)
    machine.add(b)
  }
  machine.position.set(0.4, 0.645, 2.4)
  machine.rotation.y = 0.35
  pick(machine, 'voice')
  g.add(machine)

  // Rotary phone.
  const phone = new THREE.Group()
  const pb = box(0.24, 0.08, 0.2, '#c25b4a', 0.03)
  pb.position.y = 0.04
  phone.add(pb)
  const dial = cyl(0.06, 0.06, 0.015, '#f1e8d0', 20)
  dial.position.set(0, 0.088, 0.02)
  phone.add(dial)
  const handset = box(0.24, 0.04, 0.05, '#c25b4a', 0.02)
  handset.position.set(0, 0.12, -0.04)
  phone.add(handset)
  phone.position.set(0.5, 0.645, 2.72)
  phone.rotation.y = -0.4
  pick(phone, 'voice')
  g.add(phone)
  void ctx
  shadowAll(g)
  return { group: g, led: ledMat }
}

export function buildPetBed(): THREE.Group {
  const g = new THREE.Group()
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 12, 28), mat('#d9a56b'))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.12
  g.add(rim)
  const cushion = cyl(0.42, 0.42, 0.1, '#f0d9bd', 28)
  cushion.position.y = 0.07
  g.add(cushion)
  g.position.set(4.5, 0, 3.5)
  shadowAll(g)
  return g
}

export function buildRug(wall: WallId): THREE.Group {
  const g = new THREE.Group()
  const palette: Record<WallId, [string, string]> = {
    cream: ['#c9786b', '#f0d9bd'],
    sage: ['#8fae9a', '#e9efe0'],
    blush: ['#b86d7a', '#f6dfd9'],
    sky: ['#6f93b5', '#e5eef5'],
    plum: ['#8d6fa0', '#efe5f2'],
  }
  const [a, b] = palette[wall]
  const outer = cyl(1.35, 1.35, 0.02, a, 48)
  outer.position.y = 0.012
  const inner = cyl(1.0, 1.0, 0.024, b, 48)
  inner.position.y = 0.013
  const core = cyl(0.55, 0.55, 0.028, a, 48)
  core.position.y = 0.014
  g.add(outer, inner, core)
  g.position.set(2.9, 0, 3.0)
  g.scale.set(1, 1, 0.82)
  g.traverse((c) => ((c as THREE.Mesh).isMesh ? ((c as THREE.Mesh).castShadow = false) : 0))
  return g
}

// ---------------------------------------------------------------- decor

export function buildDecor(kind: DecorKind, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group()
  switch (kind) {
    case 'plant': {
      g.add(place(cyl(0.2, 0.15, 0.3, '#d98a6c'), 0, 0.15, 0))
      g.add(place(cyl(0.19, 0.19, 0.02, '#4b3626'), 0, 0.3, 0))
      const greens = ['#4f9566', '#63ab74', '#3f8458']
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        const leaf = ball(0.14, greens[i % 3]!)
        leaf.scale.set(0.45, 1.5, 0.12)
        leaf.position.set(Math.cos(a) * 0.14, 0.62, Math.sin(a) * 0.14)
        leaf.rotation.set(Math.sin(a) * 0.55, -a, -Math.cos(a) * 0.5)
        g.add(leaf)
      }
      const mid = ball(0.14, '#58a06c')
      mid.scale.set(0.35, 1.7, 0.1)
      mid.position.set(0, 0.7, 0)
      g.add(mid)
      break
    }
    case 'cactus': {
      g.add(place(cyl(0.18, 0.14, 0.24, '#e4c9a0'), 0, 0.12, 0))
      const body = cyl(0.11, 0.12, 0.55, '#5d9a62')
      body.position.set(0, 0.5, 0)
      g.add(body, place(ball(0.11, '#5d9a62'), 0, 0.78, 0))
      for (const s of [-1, 1]) {
        const arm = cyl(0.05, 0.05, 0.2, '#5d9a62', 12)
        arm.position.set(s * 0.17, 0.55, 0)
        g.add(arm, place(ball(0.05, '#5d9a62'), s * 0.17, 0.66, 0))
        const hold = cyl(0.04, 0.04, 0.12, '#5d9a62', 12)
        hold.rotation.z = Math.PI / 2
        hold.position.set(s * 0.1, 0.46, 0)
        g.add(hold)
      }
      g.add(place(ball(0.04, '#f06aa0'), 0, 0.9, 0))
      break
    }
    case 'floorlamp': {
      g.add(place(cyl(0.18, 0.2, 0.04, '#44505b'), 0, 0.02, 0))
      g.add(place(cyl(0.018, 0.018, 1.45, '#44505b', 8), 0, 0.75, 0))
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.24, 0.3, 24, 1, true),
        glowMat(ctx, '#ffd9a0', 0.12, 0.7),
      )
      ;(shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
      shade.position.y = 1.55
      shade.castShadow = true
      g.add(shade)
      addLamp(ctx, g, 0, 1.5, 0, 2.2, '#ffc98a', 6)
      break
    }
    case 'armchair': {
      const c = '#d98a6c'
      g.add(place(box(0.78, 0.28, 0.72, c, 0.08), 0, 0.28, 0))
      g.add(place(box(0.78, 0.6, 0.18, c, 0.08), 0, 0.6, 0.27))
      for (const s of [-1, 1]) g.add(place(box(0.14, 0.4, 0.66, '#c97759', 0.06), s * 0.4, 0.38, 0))
      g.add(place(box(0.5, 0.1, 0.5, '#efc9a8', 0.05), 0, 0.5, -0.04))
      for (const [x, z] of [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]] as const) g.add(place(cyl(0.025, 0.02, 0.14, WOOD_DARK, 8), x, 0.07, z))
      break
    }
    case 'stool': {
      g.add(place(cyl(0.22, 0.22, 0.07, '#5f9ea0'), 0, 0.5, 0))
      for (const a of [0, 2.1, 4.2]) {
        const l = cyl(0.025, 0.02, 0.5, WOOD_DARK, 8)
        l.position.set(Math.cos(a) * 0.14, 0.25, Math.sin(a) * 0.14)
        l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12)
        g.add(l)
      }
      break
    }
    case 'bookcase': {
      // Fallback look; the Hunyuan3D-generated model replaces it when it is available.
      g.add(place(box(0.9, 0.9, 0.34, '#b57d4a', 0.03), 0, 0.45, 0))
      for (const y of [0.3, 0.6]) g.add(place(box(0.8, 0.04, 0.3, '#d09a62', 0.01), 0, y, 0.02))
      const cols = ['#c95f4a', '#e3b34f', '#5f8fb3', '#7aa57a']
      cols.forEach((c, i) => g.add(place(box(0.1, 0.22, 0.2, c, 0.01), -0.27 + i * 0.12, 0.43, 0.02)))
      break
    }
    case 'basket': {
      const b = cyl(0.3, 0.24, 0.34, '#c9a36d', 24)
      b.position.y = 0.17
      g.add(b)
      const blanket = ball(0.26, '#e8b4b8')
      blanket.scale.set(1, 0.45, 1)
      blanket.position.y = 0.36
      g.add(blanket)
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 8, 24, Math.PI), mat('#b08a55'))
      handle.position.y = 0.34
      g.add(handle)
      break
    }
  }
  shadowAll(g)
  return g
}

// ---------------------------------------------------------------- memory objects

export type MemoryLook = { title: string; thumb?: THREE.Texture | null }

export function buildMemory(kind: MemoryKind, look: MemoryLook, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group()
  switch (kind) {
    case 'shell': {
      const geo = new THREE.SphereGeometry(0.11, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2)
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#f4c7b9', flatShading: true, roughness: 0.55 }))
      m.scale.set(1.1, 0.5, 0.9)
      m.rotation.x = -0.35
      m.position.y = 0.04
      g.add(m)
      g.add(place(box(0.07, 0.03, 0.04, '#e9b5a4', 0.01), 0, 0.02, 0.1))
      break
    }
    case 'candle': {
      g.add(place(cyl(0.05, 0.05, 0.14, '#f6ecd2'), 0, 0.07, 0))
      g.add(place(cyl(0.07, 0.07, 0.02, '#c9a36d'), 0, 0.01, 0))
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), glowMat(ctx, '#ffb347', 1.2, 2.2))
      flame.scale.set(1, 1.7, 1)
      flame.position.y = 0.17
      g.add(flame)
      addLamp(ctx, g, 0, 0.2, 0, 0.5, '#ffb866', 1.6)
      break
    }
    case 'book': {
      g.add(place(box(0.2, 0.04, 0.15, '#5f8fb3', 0.01), 0, 0.02, 0))
      const top = box(0.18, 0.035, 0.14, '#e3b34f', 0.01)
      top.position.set(0.01, 0.0575, 0)
      top.rotation.y = 0.35
      g.add(top)
      g.add(place(box(0.19, 0.012, 0.13, '#f6efdc', 0.003), 0, 0.02, 0.002))
      break
    }
    case 'flower': {
      g.add(place(cyl(0.05, 0.04, 0.12, '#9ec6d8'), 0, 0.06, 0))
      const cols = ['#f08ab0', '#f7c948', '#ffffff']
      cols.forEach((c, i) => {
        const a = i * 2.1
        const stem = cyl(0.006, 0.006, 0.2, '#5f9d6a', 6)
        stem.position.set(Math.cos(a) * 0.025, 0.2, Math.sin(a) * 0.025)
        stem.rotation.z = Math.cos(a) * 0.25
        stem.rotation.x = -Math.sin(a) * 0.25
        g.add(stem)
        g.add(place(ball(0.035, c), Math.cos(a) * 0.06, 0.31, Math.sin(a) * 0.06))
      })
      break
    }
    case 'cassette': {
      const body = box(0.19, 0.12, 0.025, '#e8e0cc', 0.008)
      body.position.y = 0.06
      g.add(body)
      g.add(place(box(0.15, 0.05, 0.027, '#f1ebd9', 0.004), 0, 0.075, 0))
      for (const x of [-0.04, 0.04]) {
        const r = cyl(0.014, 0.014, 0.03, '#2c3640', 12)
        r.rotation.x = Math.PI / 2
        r.position.set(x, 0.075, 0)
        g.add(r)
      }
      g.add(place(box(0.15, 0.012, 0.028, '#d6496b', 0.002), 0, 0.03, 0))
      g.rotation.y = 0.2
      break
    }
    case 'postcard': {
      const card = box(0.46, 0.32, 0.012, '#f6efdc', 0.004)
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.26),
        new THREE.MeshStandardMaterial({ map: look.thumb ?? labelTexture([look.title], '#f2e3c0', '#6d4b2a'), roughness: 0.9 }),
      )
      face.position.z = 0.007
      face.userData.face = true
      card.add(face)
      for (const [x, y] of [[-0.2, 0.14], [0.2, 0.14]] as const) {
        const tape = box(0.1, 0.03, 0.004, '#f5df9a', 0.001, { transparent: true, opacity: 0.8 })
        tape.position.set(x, y, 0.009)
        tape.rotation.z = x < 0 ? 0.5 : -0.5
        card.add(tape)
      }
      card.rotation.z = 0.04
      g.add(card)
      break
    }
    case 'photo': {
      const frame = box(0.5, 0.4, 0.035, '#8a5a35', 0.01)
      g.add(frame)
      const pic = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.3),
        new THREE.MeshStandardMaterial({ map: look.thumb ?? labelTexture([look.title], '#cfe0ea', '#35566b'), roughness: 0.6 }),
      )
      pic.position.z = 0.019
      pic.userData.face = true
      frame.add(pic)
      break
    }
    case 'ticket': {
      const t = box(0.34, 0.15, 0.008, '#f4c95d', 0.004)
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.12),
        new THREE.MeshStandardMaterial({ map: labelTexture([look.title], '#f4c95d', '#7a4a12'), roughness: 0.9 }),
      )
      face.position.z = 0.005
      face.userData.face = true
      t.add(face)
      t.rotation.z = -0.06
      g.add(t)
      break
    }
  }
  shadowAll(g)
  return g
}
