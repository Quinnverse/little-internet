import * as THREE from 'three'
import {windowDrapes} from './interior.ts'
import type { DecorKind, FloorId, House, MemoryKind, WallId } from '../core/room.ts'
import type { BuildCtx, MemoryLook, Shell, Wall } from './builders.ts'
import type { Exterior } from './exterior.ts'
import { screenTexture } from './builders.ts'
import { floorTexture, glowTexture, labelTexture, WALL_COLORS, sprigWallpaper } from './materials.ts'
import { getModel } from './models.ts'

/**
 * The room assembled from the Blender models. Same shapes and pick ids as the code-drawn builders, so the
 * view can use either. Positions come from assets/blender/build_props.py (PLACE) and the app's layout.
 */

type Opts = { at?: [number, number, number]; yaw?: number; pick?: string }

/**
 * The Blender kit ships with poster-paint colours: a neon book spine next to a mint record player reads
 * like a toy. Pulling saturation back a quarter and taking the edge off the brightest values is enough
 * to make the same geometry read as a room someone actually lives in.
 */
function calmPalette(root: THREE.Object3D) {
  if (root.userData.calmed) return
  root.userData.calmed = true
  const seen = new Set<THREE.Material>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as THREE.MeshStandardMaterial
      if (!mat || seen.has(mat) || !mat.color) continue
      seen.add(mat)
      if (/^emissive_/.test(mat.name) || mat.name === 'screen') continue
      const h = { h: 0, s: 0, l: 0 }
      mat.color.getHSL(h)
      if (h.s > 0.3) mat.color.setHSL(h.h, Math.min(0.5, h.s * 0.68), Math.min(0.64, h.l * 0.9))
    }
  })
}

function need(name: string): THREE.Group {
  const m = getModel(name)
  if (!m) throw new Error(`model ${name} is not loaded`)
  calmPalette(m)
  return m
}

function put(parent: THREE.Object3D, name: string, o: Opts = {}): THREE.Group {
  const g = new THREE.Group()
  g.add(need(name))
  if (o.at) g.position.set(...o.at)
  if (o.yaw) g.rotation.y = o.yaw
  if (o.pick) g.userData.pick = o.pick
  parent.add(g)
  return g
}

type GlowMode = 'day-room' | 'exterior'

/** Lit materials follow the time of day: screens, bulbs, flames, windows. */
function registerGlows(root: THREE.Object3D, ctx: BuildCtx, mode: GlowMode = 'day-room', skip?: THREE.Material) {
  const seen = new Set<THREE.Material>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as THREE.MeshStandardMaterial
      if (seen.has(mat) || mat === skip) continue
      seen.add(mat)
      const name = mat.name
      if (!(name.startsWith('emissive_') || name === 'screen')) continue
      if (ctx.glows.some((g) => g.mat === mat)) continue
      const base = (mat.userData.glowBase ??= mat.emissiveIntensity || 1) as number
      let day = base * 0.5
      let night = base
      if (name === 'screen') [day, night] = [base * 0.75, base * 1.7]
      else if (name === 'emissive_lampshade') [day, night] = [base * 0.25, base]
      else if (name === 'emissive_window') [day, night] = mode === 'exterior' ? [base * 0.35, base * 1.6] : [base * 1.6, base * 0.15]
      else if (name === 'emissive_sconce' || name === 'emissive_doorway') [day, night] = [base * 0.3, base]
      ctx.glows.push({ mat, day, night })
    }
  })
}

function lamp(ctx: BuildCtx, parent: THREE.Object3D, x: number, y: number, z: number, intensity: number, color = '#ffc98a', dist = 5) {
  const l = new THREE.PointLight(color, intensity, dist, 1.6)
  l.position.set(x, y, z)
  l.userData.base = intensity
  parent.add(l)
  ctx.lamps.push(l)
  halo(l, parent, color, intensity)
  return l
}

/** A soft additive halo. Without it a point light only brightens surfaces; the bulb itself stays a dull dot. */
function halo(l: THREE.PointLight, parent: THREE.Object3D, color: string, intensity: number) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  s.name = 'lamp-halo'
  s.scale.setScalar(0.55 + Math.min(0.9, intensity * 0.05))
  s.position.copy(l.position)
  l.userData.halo = s
  parent.add(s)
}

// ---------------------------------------------------------------- the room shell

const WALL_BASE: Record<House, string> = { cabin: 'cf1e3c8', villa: 'cf3efe6' }

function cloneMats(root: THREE.Object3D, recolor?: (name: string) => string | null): THREE.Material[] {
  const map = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  const out: THREE.Material[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const swap = (src: THREE.Material) => {
      let c = map.get(src)
      if (!c) {
        c = (src as THREE.MeshStandardMaterial).clone()
        c.transparent = true
        const color = recolor?.(src.name)
        if (color) {
          c.color.set(color)
          c.map=sprigWallpaper()
          c.map.userData.roomOwned=true
          c.onBeforeCompile=(shader)=>{
            shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvec3 pointOnWall=(modelMatrix*vec4(position,1.)).xyz; vMapUv=vec2(pointOnWall.x+pointOnWall.z,pointOnWall.y)*1.65;')
          }
        }
        c.userData.roomOwned=true
        map.set(src, c)
        out.push(c)
      }
      return c
    }
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material)
  })
  return out
}

export function kitShell(house: House, wallId: WallId, floorId: FloorId, ctx: BuildCtx): Shell {
  const root = need(`${house}_room_shell`)
  const group = new THREE.Group()
  group.add(root)
  const take = (names: string[]): THREE.Group => {
    const g = new THREE.Group()
    for (const n of names) {
      const o = root.getObjectByName(n)
      if (o) g.add(o)
    }
    return g
  }
  const recolor = (n: string) => (n === WALL_BASE[house] ? WALL_COLORS[wallId] : null)
  const defs: { names: string[]; inward: THREE.Vector3; point: THREE.Vector3 }[] = [
    { names: ['wall_back', 'window_glass', 'window_frame', 'window_curtains', 'window_blind'], inward: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(3, 1, 0) },
    { names: ['wall_left', 'door_frame', 'door_pivot', 'doormat'], inward: new THREE.Vector3(1, 0, 0), point: new THREE.Vector3(0, 1, 3) },
    { names: ['wall_front'], inward: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(3, 1, 6) },
    { names: ['wall_right'], inward: new THREE.Vector3(-1, 0, 0), point: new THREE.Vector3(6, 1, 3) },
  ]
  const walls: Wall[] = defs.map((d) => {
    const g = take(d.names)
    group.add(g)
    // The shell has to cast shadows, or the window stops being a light source: everything ends up
    // uniformly lit and the room reads as a drawing instead of a place.
    g.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    return { group: g, inward: d.inward, point: d.point, mats: cloneMats(g, recolor), alpha: 1 }
  })
  // the window shows the sky by day; it is lit warm only from outside
  registerGlows(walls[0]!.group, ctx, 'day-room')

  const doorPivot = group.getObjectByName('door_pivot') as THREE.Group
  doorPivot.userData.pick = 'door'
  const curtains=group.getObjectByName('window_curtains')
  if(curtains){
    curtains.visible=false
    const drapes=windowDrapes()
    walls[0]!.group.add(drapes.group)
    walls[0]!.mats.push(drapes.cloth)
  }
  const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(6.12,6.12),new THREE.MeshStandardMaterial({color:'#eae0cc',roughness:.97}))
  ceiling.rotation.x=Math.PI/2
  ceiling.position.set(3,3.16,3)
  ceiling.name='interior-ceiling'
  group.add(ceiling)
  const glass = group.getObjectByName('window_glass')
  if (glass) {
    glass.userData.pick = 'window'
    const pane=new THREE.Mesh(new THREE.PlaneGeometry(1.19,1.39),new THREE.MeshBasicMaterial({transparent:true}))
    pane.name='view-through-window';pane.position.set(3.2,1.7,-.048);pane.userData.pick='window'
    walls[0]!.group.add(pane);walls[0]!.mats.push(pane.material)
  }

  // The owner's floor is a generated texture on a plane just above the model's plain floor.
  const modelFloor = root.getObjectByName('floor')
  if (modelFloor) modelFloor.visible = false
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: floorTexture(floorId), roughness: 0.75 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(3, 0.002, 3)
  floor.receiveShadow = true
  group.add(floor)
  return { group, walls, doorPivot, floor }
}

// ---------------------------------------------------------------- built-in furniture

export function kitFurniture(ctx: BuildCtx, hasWelcome: boolean): { group: THREE.Group; picks: THREE.Object3D[]; led: THREE.MeshStandardMaterial | null } {
  const g = new THREE.Group()
  const picks: THREE.Object3D[] = []

  put(g, 'desk', { at: [1.0, 0, 0.47] })
  put(g, 'office_chair', { at: [1.5, 0, 1.55], yaw: 0.25 })
  const shelf = put(g, 'bookshelf', { at: [5.0, 0, 0], pick: 'shelf' })
  picks.push(shelf)
  put(g, 'dresser', { at: [3.2, 0, 0.3] })
  put(g, 'side_table', { at: [0.46, 0, 2.5] })
  put(g, 'pet_bed', { at: [4.5, 0, 3.5] })
  put(g, 'rug', { at: [2.9, 0, 3.0] })

  const computer = put(g, 'computer', { at: [1.4, 0.775, 0.3], yaw: 0.12, pick: 'computer' })
  picks.push(computer)
  // The screen shows a little homepage (the owner's website lives behind it).
  const screen = computer.getObjectByName('screen') as THREE.Mesh | undefined
  if (screen?.isMesh) {
    screen.userData.kit=false
    screen.geometry = screen.geometry.clone()
    planarUV(screen)
    const tex = screenTexture()
    const sm = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.35 })
    sm.name = 'screen-live'
    screen.material = sm
    ctx.glows.push({ mat: sm, day: 0.45, night: 1.1 })
  }
  const kb = put(g, 'keyboard_mouse', { at: [1.38, 0.775, 0.68], yaw: 0.12, pick: 'computer' })
  picks.push(kb)
  picks.push(put(g, 'diary', { at: [0.62, 0.8, 0.55], yaw: 0.18, pick: 'diary' }))
  put(g, 'desk_lamp', { at: [0.22, 0.775, 0.22] })
  put(g, 'pen_cup', { at: [1.8, 0.775, 0.22] })
  put(g, 'mug', { at: [1.05, 0.8, 0.78], yaw: 0.5 })
  put(g, 'stickers', { at: [1.0, 0.8, 0.84], yaw: 0.3 })

  const machine = put(g, 'answering_machine', { at: [0.4, 0.645, 2.4], yaw: 0.35, pick: 'voice' })
  const phone = put(g, 'rotary_phone', { at: [0.5, 0.645, 2.72], yaw: -0.4, pick: 'voice' })
  picks.push(machine, phone)

  picks.push(put(g, 'record_player', { at: [3.0, 0.8, 0.36], pick:'records' }))
  put(g, 'lava_lamp', { at: [3.55, 0.8, 0.42] })
  picks.push(put(g, 'cd_disc', { at: [1.88, 0.775, 0.66], yaw: -0.5, pick: 'export' }))
  picks.push(put(g, 'photo_wall', { at: [1.0, 1.75, 0.0], pick:'wall' }))
  put(g, 'wall_clock', { at: [3.2, 2.78, 0.0] })
  picks.push(put(g, 'calendar', { at: [0.0, 2.3, 0.5], yaw: Math.PI / 2, pick:'calendar' }))

  // The answering machine's light pulses when there is a welcome message; give it its own material.
  let led: THREE.MeshStandardMaterial | null = null
  machine.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && (m.material as THREE.Material).name === 'emissive_led') {
      led = (m.material as THREE.MeshStandardMaterial).clone()
      led.userData.roomOwned=true
      m.material = led
    }
  })
  if (led) (led as THREE.MeshStandardMaterial).emissiveIntensity = hasWelcome ? 1.6 : 0.05

  registerGlows(g, ctx, 'day-room', led ?? undefined)
  lamp(ctx, g, 0.12, 1.1, 0.24, 1.6, '#ffc98a', 4.5) // desk lamp
  lamp(ctx, g, 1.4, 1.07, 0.9, 0.35, '#9cc7ff', 2.2) // screen glow
  return { group: g, picks, led }
}

// ---------------------------------------------------------------- decor and keepsakes

const DECOR_MODEL: Record<DecorKind, string> = {
  plant: 'plant',
  cactus: 'cactus',
  floorlamp: 'floor_lamp',
  armchair: 'armchair',
  stool: 'stool',
  basket: 'basket',
  bookcase: 'mini_bookcase',
}

export function kitDecor(kind: DecorKind, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group()
  const m = need(DECOR_MODEL[kind])
  g.add(m)
  if (kind === 'floorlamp') lamp(ctx, g, 0, 1.5, 0, 2.2, '#ffc98a', 6)
  registerGlows(g, ctx)
  return g
}

const MEMORY_MODEL: Record<MemoryKind, string> = {
  shell: 'keepsake_shell',
  candle: 'keepsake_candle',
  book: 'keepsake_book',
  flower: 'keepsake_flower_vase',
  cassette: 'keepsake_cassette',
  postcard: 'keepsake_postcard',
  photo: 'keepsake_photo_frame',
  ticket: 'keepsake_ticket',
}

/** Flat UVs for a thin box so a photo can be mapped onto its front face (the models carry no UVs). */
function planarUV(mesh: THREE.Mesh) {
  const geo = mesh.geometry as THREE.BufferGeometry
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const pos = geo.attributes.position!
  const uv = new Float32Array(pos.count * 2)
  const w = bb.max.x - bb.min.x || 1
  const h = bb.max.y - bb.min.y || 1
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - bb.min.x) / w
    uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / h
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

export function kitMemory(kind: MemoryKind, look: MemoryLook, ctx: BuildCtx): THREE.Group {
  const g = new THREE.Group()
  const m = need(MEMORY_MODEL[kind])
  g.add(m)
  const faceName = kind === 'photo' ? 'photo' : kind === 'postcard' ? 'picture' : null
  if (faceName) {
    const face = m.getObjectByName(faceName) as THREE.Mesh | undefined
    if (face?.isMesh) {
      face.userData.kit=false
      face.geometry = face.geometry.clone()
      planarUV(face)
      face.material = new THREE.MeshStandardMaterial({
        map: look.thumb ?? labelTexture([look.title], kind === 'photo' ? '#cfe0ea' : '#f2e3c0', kind === 'photo' ? '#35566b' : '#6d4b2a'),
        roughness: 0.7,
      })
      face.userData.face = true
    }
  }
  if (kind === 'candle') lamp(ctx, g, 0, 0.2, 0, 0.5, '#ffb866', 1.6)
  registerGlows(g, ctx)
  return g
}

// ---------------------------------------------------------------- the front of the house

export function kitExterior(house: House, wall: WallId): Exterior {
  const group = need(`${house}_exterior`)
  const walls = group.getObjectByName('house_walls') as THREE.Mesh | undefined
  if (walls?.isMesh) {
    const m = (walls.material as THREE.MeshStandardMaterial).clone()
    m.color.set(WALL_COLORS[wall])
    m.userData.roomOwned=true
    walls.material = m
  }
  const lamps: THREE.PointLight[] = []
  const doorPivot = group.getObjectByName('door_pivot') as THREE.Group
  const inner = new THREE.PointLight('#ffc27a', 1.6, 5, 1.6)
  inner.position.set(0, 1.4, -0.6)
  group.add(inner)
  const sc = new THREE.PointLight('#ffc27a', 1.4, 6, 1.6)
  sc.position.set(-1.05, 2.05, 0.5)
  group.add(sc)
  lamps.push(inner, sc)
  group.updateMatrixWorld(true)
  const bell = new THREE.Vector3()
  group.getObjectByName('hs_doorbell')?.getWorldPosition(bell)
  const mailbox = new THREE.Vector3()
  group.getObjectByName('hs_mailbox')?.getWorldPosition(mailbox)
  const ex: Exterior = {
    group,
    doorPivot,
    bell,
    mailbox,
    petSpot: new THREE.Vector3(0.7, 0.14, 0.9),
    doorway: new THREE.Vector3(0, 1.1, -0.4),
    lamps,
  }
  return ex
}

export function kitExteriorGlows(ex: Exterior, ctx: BuildCtx) {
  registerGlows(ex.group, ctx, 'exterior')
}
