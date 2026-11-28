import * as THREE from 'three'
import {windowDrapes} from './interior.ts'
import type { DecorKind, FloorId, House, MemoryKind, WallId } from '../core/room.ts'
import type { BuildCtx, MemoryLook, Shell, Wall } from './builders.ts'
import type { Exterior } from './exterior.ts'
import { screenTexture } from './builders.ts'
import { ball, floorRoughness, floorTexture, glowTexture, labelTexture, photoTex, softenTex, WALL_COLORS } from './materials.ts'
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
export function calmPalette(root: THREE.Object3D, amount = 1) {
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
      // Printed matter and book spines are *meant* to be the one place with colour; flattening those
      // turns the shelf into grey cardboard.
      if (/book|spine|poster|print|paper|page|sticker|label/i.test(mat.name)) continue
      const h = { h: 0, s: 0, l: 0 }
      mat.color.getHSL(h)
      if (h.s < 0.22 || h.l > 0.82) continue
      // Hue toward amber rather than flattening everything to one tone: the room keeps a little
      // variety, it just stops arguing with itself.
      const h2 = h.h + (0.09 - h.h) * 0.35 * amount
      mat.color.setHSL((h2 + 1) % 1, h.s * (1 - 0.5 * amount), Math.min(0.7, h.l * 0.97))
    }
  })
}

function need(name: string): THREE.Group {
  const m = getModel(name)
  // A missing model used to throw and take the whole room down with it — one asset deleted from
  // models.generated.ts and the visitor got an empty shell. Degrade to an empty group instead.
  if (!m) {
    if (name !== 'missing') console.warn(`[kit] model ${name} is not loaded; skipping`)
    return new THREE.Group()
  }
  calmPalette(m)
  return m
}

/**
 * A modelled surface has no UVs — the GLB only ships POSITION and NORMAL — so detail has to be projected
 * from world position, picking the plane the fragment's normal faces. Without this every sofa, chair and
 * cabinet renders as one flat colour, which is most of why the room read as a toy next to the references.
 */
function surfaceDetail(root: THREE.Object3D, kind: 'weave' | 'wood') {
  const f = kind === 'weave' ? 9.5 : 2.4
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    // Books and pages live inside the shelf model. Projecting timber grain over them printed a
    // regular white grid across every spine — the exact artefact that makes a render look fake.
    if (/book|page|paper|spine|sheet|label/i.test(mesh.name)) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const src of list) {
      const m = src as THREE.MeshStandardMaterial
      if (!m || m.userData.detailed || m.transparent || m.emissiveMap) continue
      m.userData.detailed = true
      m.map = kind === 'weave' ? photoTex('wool_diff', true) : photoTex('wood_diff', true)
      m.map.userData.roomOwned = true
      if (kind === 'wood') {
        m.roughnessMap = photoTex('wood_rough')
        m.roughness = 0.85
      }
      if (kind === 'weave') {
        // Boucle, not a woven grid: the reference sofa reads as fibre under raking light, and a
        // normal map is the only way to get that without extra geometry.
        m.normalMap = photoTex('wool_nor')
        m.normalScale.set(0.55, 0.55)
        // The boucle roughness map is dark, which turned the sofa into a mirror under the floor lamp;
        // cloth is uniformly matte, so a constant beats a map here.
        m.roughness = 0.98
      }
      m.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\nvec3 wp=(modelMatrix*vec4(position,1.)).xyz; vec3 wn=abs(normalMatrix*normal); vec2 tuv=(wn.y>wn.x&&wn.y>wn.z?vec2(wp.x,wp.z):(wn.x>wn.z?vec2(wp.z,wp.y):vec2(wp.x,wp.y)))*' + f.toFixed(3) + '; vMapUv=tuv;\n#ifdef USE_NORMALMAP\n vNormalMapUv=tuv;\n#endif\n#ifdef USE_ROUGHNESSMAP\n vRoughnessMapUv=tuv;\n#endif',
        )
      }
      m.needsUpdate = true
    }
  })
}

/**
 * Decor items are placed straight from the GLB without going through kitFurniture, so they missed the
 * surface pass and the reference sofa stayed a flat white blob. This gives them the same treatment.
 */
const DECOR_SURFACE: Record<string, 'wood' | 'weave'> = {
  plant: 'wood', cactus: 'wood', armchair: 'weave', stool: 'wood', basket: 'weave', bookcase: 'wood', floorlamp: 'wood',
}
export function applyKindTint(root: THREE.Object3D, kind: string) {
  const hex = HOME_TINT[kind]
  if (hex) tintObject(root, hex)
}

export function decorDetail(root: THREE.Object3D, kind: string) {
  const k = DECOR_SURFACE[kind]
  if (k) surfaceDetail(root, k)
}

let contactTex: THREE.CanvasTexture | null = null
function contactTexture(): THREE.CanvasTexture {
  if (contactTex) return contactTex
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.62)')
  grad.addColorStop(0.75, 'rgba(255,255,255,0.2)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  contactTex = new THREE.CanvasTexture(c)
  contactTex.colorSpace = THREE.NoColorSpace
  return contactTex
}

/**
 * Furniture sat *on* the floor like stickers: the shadow map is one 2048 texture over 18 m, so the 2 cm
 * under a cabinet is far below its resolution. This puts a soft radial darkening under every footprint
 * instead. Cheap (one draw call per piece, one shared texture) and it is the single biggest cue that an
 * object has weight.
 */
export function addContactShadows(container: THREE.Object3D) {
  container.updateMatrixWorld(true)
  const tex = contactTexture()
  const box = new THREE.Box3()
  for (const child of [...container.children]) {
    if ((child as THREE.Mesh).isMesh && !child.children.length) {
      // A flat plate (rug, mat) casting a shadow on itself reads as a stain; skip anything low.
      if (box.setFromObject(child).isEmpty()) continue
    }
    const b = box.setFromObject(child)
    if (b.isEmpty()) continue
    const size = b.getSize(new THREE.Vector3())
    const center = b.getCenter(new THREE.Vector3())
    container.worldToLocal(center)
    if (size.x < 0.08 || size.z < 0.08) continue
    if (size.y < 0.12) continue // rugs, mats and decals
    if (b.min.y > 0.06) continue // things standing on a desk or a shelf
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 1.12, size.z * 1.12),
      new THREE.MeshBasicMaterial({ color: 0x2a1c12, alphaMap: tex, transparent: true, depthWrite: false, opacity: 0.55 }),
    )
    m.rotation.x = -Math.PI / 2
    m.position.set(center.x, 0.0085, center.z)
    m.renderOrder = 1
    m.userData.noShadow = true
    container.add(m)
  }
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

/** Blender's shadow map only catches silhouettes; the soft pool where a leg meets the floor is what
 *  tells the eye an object is standing on something. One radial texture, one flat quad per item. */
let blobTex: THREE.CanvasTexture | null = null
let blobMat: THREE.MeshBasicMaterial | null = null
function blobMaterial() {
  if (blobMat) return blobMat
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2)
  grad.addColorStop(0, 'rgba(24,15,8,0.86)')
  grad.addColorStop(0.44, 'rgba(24,15,8,0.44)')
  grad.addColorStop(1, 'rgba(28,18,10,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  blobTex = new THREE.CanvasTexture(c)
  blobTex.colorSpace = THREE.SRGBColorSpace
  blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.95 })
  blobMat.name = 'contact-shadow'
  return blobMat
}

/** Drops a soft shadow under every floor-standing child of `parent` (cabinets, chairs, shelves). */
export function groundShadows(parent: THREE.Object3D) {
  const box = new THREE.Box3()
  for (const child of parent.children) {
    if (child.userData.shadowed) continue
    box.setFromObject(child)
    if (!Number.isFinite(box.min.y)) continue
    const h = box.max.y - box.min.y
    const w = box.max.x - box.min.x
    const d = box.max.z - box.min.z
    // Only things that actually stand on the floor and are tall enough to cast a pool.
    if (box.min.y > 0.12 || h < 0.22) continue
    const r = Math.max(w, d) * 0.62
    if (r > 2.6) continue
    const q = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), blobMaterial())
    q.rotation.x = -Math.PI / 2
    q.position.set((box.min.x + box.max.x) / 2, 0.012, (box.min.z + box.max.z) / 2)
    q.renderOrder = 1
    q.userData.kit = false
    q.userData.shadowed = true
    parent.add(q)
    child.userData.shadowed = true
  }
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
          c.map=softenTex('wall_diff',7,0.8,1.06)
          c.map.userData.roomOwned=true
          c.normalMap=softenTex('wall_nor',3)
          c.normalScale.set(0.055,0.055)
          c.roughnessMap=photoTex('wall_rough')
          c.roughness=1.0
          c.onBeforeCompile=(shader)=>{
            // Object-space axonometric projection: no UVs ship with the GLB, and the old world-space
            // (x+z) trick skewed the print on the walls that run the other way.
            shader.vertexShader=shader.vertexShader
              .replace('#include <common>', '#include <common>\nvarying vec3 vWallP;')
              .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWallP=(modelMatrix*vec4(position,1.)).xyz;\nvec3 wp=(modelMatrix*vec4(position,1.)).xyz; vec3 wn=abs(normalMatrix*normal); vec2 tuv=(wn.x>wn.z?vec2(wp.z,wp.y):vec2(wp.x,wp.y))*0.33; vMapUv=tuv;\n#ifdef USE_NORMALMAP\n vNormalMapUv=tuv;\n#endif\n#ifdef USE_ROUGHNESSMAP\n vRoughnessMapUv=tuv;\n#endif')
            // ...and the same falloff in the shader: floor line, ceiling line, room corners.
            shader.fragmentShader=shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWallP;')
            .replace('#include <map_fragment>', `#include <map_fragment>
            float aoW=1.0;
            aoW*=mix(0.52,1.0,smoothstep(0.0,0.55,vWallP.y));
            aoW*=mix(0.60,1.0,1.0-smoothstep(2.55,3.16,vWallP.y));
            float eW=min(min(vWallP.x,6.0-vWallP.x),min(vWallP.z,6.0-vWallP.z));
            aoW*=mix(0.68,1.0,smoothstep(0.0,0.55,eW));
            diffuseColor.rgb*=aoW;`)
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
    ctx.winds.push(drapes.cloth)
    // Collect the compiled shader so the render loop can drive its clock.
    const prevCompile=drapes.cloth.onBeforeCompile
    drapes.cloth.onBeforeCompile=(shader,renderer)=>{
      prevCompile.call(drapes.cloth,shader,renderer)
      ;(drapes.cloth.userData.shaders??=[]).push(shader)
    }
  }
  // A flat, evenly lit plane at the top of the frame is the fastest way to make a room look like a
  // cardboard box, so the ceiling gets the same plaster tooth as the walls and a tone below the walls.
  const ceilMap = photoTex('wall_diff', true)
  ceilMap.repeat.set(2.4, 2.4)
  // A ceiling only ever sees bounce light, so it renders as a dark lid. A little self-lit warmth
  // standing in for the bounce is the difference between a lid and a ceiling.
  const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(6.12,6.12),new THREE.MeshStandardMaterial({color:'#efe6d5',map:ceilMap,roughness:1,emissive:'#8f7758',emissiveIntensity:0.85}))
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
    // A window without joinery is a poster: two muntins and a hint of haze give the opening a scale
    // and put the landscape behind glass instead of on it.
    const trim=new THREE.MeshStandardMaterial({color:'#efe4d2',roughness:0.62})
    for (const [w,h,x,y] of [[1.19,0.03,3.2,1.7],[0.03,1.39,3.2,1.7]]) {
      const bar=new THREE.Mesh(new THREE.BoxGeometry(w,h,0.035),trim)
      bar.position.set(x,y,-0.038)
      bar.castShadow=true
      walls[0]!.group.add(bar)
    }
    const veilTex=softenTex('wall_diff',2)
    const veil=new THREE.Mesh(new THREE.PlaneGeometry(1.19,1.39),
      new THREE.MeshBasicMaterial({color:'#efe8da',transparent:true,opacity:0.13,depthWrite:false}))
    veil.position.set(3.2,1.7,-0.052)
    walls[0]!.group.add(veil);walls[0]!.mats.push(veil.material)
    void veilTex
  }

  // The owner's floor is a generated texture on a plane just above the model's plain floor.
  const modelFloor = root.getObjectByName('floor')
  if (modelFloor) modelFloor.visible = false
  const oak = floorId === 'oak'
  // One 1k plank patch across six metres made the boards read like a blurry gradient, so the patch
  // repeats three times: roughly 30 cm boards at a believable grain scale.
  const tile = (t: THREE.Texture) => {
    const c = t.clone()
    c.needsUpdate = true
    c.repeat.set(3, 3)
    c.userData.roomOwned = true
    return c
  }
  const floorMat = new THREE.MeshStandardMaterial({
    map: oak ? tile(photoTex('planks_diff', true)) : floorTexture(floorId),
    roughnessMap: oak ? tile(photoTex('planks_rough')) : floorRoughness(floorId),
    roughness: 1.0,
  })
  if (oak) {
    floorMat.normalMap = tile(photoTex('planks_nor'))
    floorMat.normalScale.set(0.55, 0.55)
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(3, 0.002, 3)
  floor.receiveShadow = true
  group.add(floor)
  return { group, walls, doorPivot, floor }
}

/**
 * One palette, not six. The reference rooms are a single warm neutral with one accent; a teal chair,
 * a mauve armchair and a plum rug in the same shot is the thing that reads as amateur. These tints
 * pull every upholstered piece into the same oatmeal/walnut family.
 */
const HOME_TINT: Record<string, string> = {
  armchair: '#b1a08c',
  office_chair: '#4b5045',
  rug: '#c0ad93',
  pet_bed: '#9c8e7c',
  stool: '#a8917a',
  basket: '#a5937b',
}

function tintObject(o: THREE.Object3D, hex: string) {
  o.traverse((n) => {
    const mesh = n as THREE.Mesh
    if (!mesh.isMesh) return
    // Legs, frames and hardware keep their own material: tinting the whole piece turns a chair into
    // a single flat colour and it reads like a placeholder.
    if (/leg|frame|metal|base|foot|handle|knob|trims?$/i.test(mesh.name)) return
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).slice()
    for (const m of mats) (m as THREE.MeshStandardMaterial).color?.set(hex)
  })
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
  // Texture the flat-coloured pieces: upholstery weaves, timber grain.
  for (const n of ['desk', 'bookshelf', 'dresser', 'side_table', 'stool', 'mini_bookcase']) {
    const o = g.getObjectByName(n)
    if (o) surfaceDetail(o, 'wood')
  }
  for (const n of ['office_chair', 'armchair', 'rug', 'pet_bed', 'basket']) {
    const o = g.getObjectByName(n)
    if (o) surfaceDetail(o, 'weave')
  }
  for (const n of Object.keys(HOME_TINT)) {
    const o = g.getObjectByName(n)
    if (o) applyKindTint(o, n)
  }

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

  // Set dressing. A room that is exactly the furniture the product ships reads as a showroom; four
  // small, off-axis objects are enough to make it read as somewhere a person actually lives.
  // They are not pickable and carry no state, so they cannot get in the way of the owner's own things.
  put(g, 'keepsake_book', { at: [3.15, 0.0, 2.05], yaw: 0.42 }).scale.setScalar(0.92)
  put(g, 'keepsake_book', { at: [0.95, 0, 1.95], yaw: -0.7 }).scale.setScalar(0.8)
  put(g, 'basket', { at: [5.42, 0, 0.95], yaw: 0.3 })
  const scrap = ball(0.055, '#efe7d7')
  scrap.position.set(4.95, 0.055, 1.55)
  scrap.rotation.set(0.4, 0.9, 0.2)
  g.add(scrap)
  // The gallery above the desk hangs on a backing board. It reads as a pale rectangle against the
  // plaster, and every attempt to hide it (hide the object, blank the material, hide the wall's spare
  // face) also removed the prints — they share geometry groups and material instances with the board.
  // So the board stays, but it is lit softer: no shadow casting, and its whiteness is pulled down.
  const photoWall = put(g, 'photo_wall', { at: [1.0, 1.75, 0.0], pick:'wall' })
  photoWall.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.geometry.computeBoundingBox()
    const bb = mesh.geometry.boundingBox!
    if (Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) < 0.5) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      const sm = m as THREE.MeshStandardMaterial
      sm.color?.multiplyScalar(0.86)
    }
  })
  picks.push(photoWall)
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
  groundShadows(g)
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
