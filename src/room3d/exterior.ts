import * as THREE from 'three'
import type { House, WallId } from '../core/room.ts'
import { ball, box, cyl, mat, place, WALL_COLORS } from './materials.ts'

export type Exterior = {
  group: THREE.Group
  doorPivot: THREE.Group
  /** Where the doorbell is (world), for the hotspot and the ring effect. */
  bell: THREE.Vector3
  /** Where the pet waits for visitors. */
  petSpot: THREE.Vector3
  doorway: THREE.Vector3
  lamps: THREE.PointLight[]
}

const DOOR_W = 0.95
const DOOR_H = 1.95

/** The front of the house, seen when a visitor first arrives: garden, path, door, doorbell. */
export function buildExterior(house: House, wall: WallId): Exterior {
  const g = new THREE.Group()
  const lamps: THREE.PointLight[] = []
  const villa = house === 'villa'
  const wallColor = WALL_COLORS[wall]

  // Ground and garden.
  const ground = cyl(9, 9.4, 0.4, '#8fbf7a', 56)
  ground.position.y = -0.2
  g.add(ground)
  const lawn = cyl(8.4, 8.4, 0.03, '#a3cf8a', 56)
  lawn.position.y = 0.02
  lawn.castShadow = false
  g.add(lawn)
  for (let i = 0; i < 7; i++) {
    const s = box(0.9, 0.06, 0.55, i % 2 ? '#d8d2c4' : '#e6e0d2', 0.04)
    s.position.set(((i % 2) - 0.5) * 0.25, 0.05, 1.6 + i * 0.85)
    s.rotation.y = ((i % 3) - 1) * 0.08
    g.add(s)
  }

  // Walls with a doorway (a short tunnel to a warmly lit interior).
  const T = 0.8
  const bodyW = 5.4
  const bodyH = 2.9
  const frontZ = 0
  const seg = (x0: number, x1: number, y0: number, y1: number) => {
    const b = box(x1 - x0, y1 - y0, T, wallColor, 0.02)
    b.material = mat(wallColor, { roughness: 0.95 })
    b.position.set((x0 + x1) / 2, (y0 + y1) / 2, frontZ - T / 2)
    g.add(b)
  }
  const hw = DOOR_W / 2
  seg(-bodyW / 2, -hw, 0, bodyH)
  seg(hw, bodyW / 2, 0, bodyH)
  seg(-hw, hw, DOOR_H, bodyH)
  const back = box(bodyW, bodyH, 3.2, wallColor, 0.02)
  back.material = mat(wallColor, { roughness: 0.95 })
  back.position.set(0, bodyH / 2, -T - 1.6)
  g.add(back)
  // Warm light inside the doorway.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_W, DOOR_H),
    new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffbf70', emissiveIntensity: 1.2 }),
  )
  glow.position.set(0, DOOR_H / 2, -T + 0.01)
  g.add(glow)
  const inner = new THREE.PointLight('#ffc27a', 1.6, 5, 1.6)
  inner.position.set(0, 1.4, -0.6)
  g.add(inner)
  lamps.push(inner)

  // Base trim.
  const base = box(bodyW + 0.12, 0.2, T + 0.1, villa ? '#d8d4cb' : '#8c6a4b', 0.03)
  base.position.set(0, 0.1, frontZ - T / 2 + 0.03)
  g.add(base)

  // Roof.
  if (villa) {
    const slab = box(bodyW + 0.8, 0.28, 4.8, '#f6f3ec', 0.06)
    slab.position.set(0, bodyH + 0.14, -2.0)
    g.add(slab)
    const upper = box(3.4, 1.3, 3.0, '#ece7dc', 0.04)
    upper.position.set(-0.6, bodyH + 0.28 + 0.65, -2.4)
    g.add(upper)
    const cap = box(3.8, 0.2, 3.4, '#f6f3ec', 0.05)
    cap.position.set(-0.6, bodyH + 0.28 + 1.4, -2.4)
    g.add(cap)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshStandardMaterial({ color: '#cfe8ff', emissive: '#ffd9a0', emissiveIntensity: 0.35, roughness: 0.15 }))
    glass.position.set(-0.6, bodyH + 0.28 + 0.7, -0.89)
    g.add(glass)
  } else {
    const shape = new THREE.Shape()
    shape.moveTo(-3.15, 0)
    shape.lineTo(3.15, 0)
    shape.lineTo(0, 1.7)
    shape.closePath()
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 4.6, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 })
    const roof = new THREE.Mesh(roofGeo, mat('#a8553a', { roughness: 0.85 }))
    roof.position.set(0, bodyH, -4.3)
    roof.castShadow = true
    roof.receiveShadow = true
    g.add(roof)
    const gable = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), mat('#f2e3c0'))
    gable.position.set(0, bodyH + 0.8, 0.32)
    g.add(gable)
    const chimney = box(0.5, 1.3, 0.5, '#8a5a45', 0.03)
    chimney.position.set(1.7, bodyH + 1.0, -2.4)
    g.add(chimney)
  }

  // Door.
  const trim = villa ? '#f6f3ec' : '#7d5233'
  for (const [w, h, x, y] of [
    [0.09, DOOR_H + 0.05, -hw - 0.045, DOOR_H / 2],
    [0.09, DOOR_H + 0.05, hw + 0.045, DOOR_H / 2],
    [DOOR_W + 0.2, 0.1, 0, DOOR_H + 0.05],
  ] as const) {
    const f = box(w, h, 0.14, trim, 0.015)
    f.position.set(x, y, 0.05)
    g.add(f)
  }
  const doorPivot = new THREE.Group()
  doorPivot.position.set(-hw, 0, -0.1)
  const leaf = box(DOOR_W - 0.02, DOOR_H - 0.03, 0.07, villa ? '#7fa3a1' : '#a1693b', 0.02)
  leaf.position.set(DOOR_W / 2, DOOR_H / 2, 0)
  doorPivot.add(leaf)
  for (const [y, hh] of [[1.45, 0.7], [0.6, 0.6]] as const) {
    const p = box(0.55, hh, 0.02, villa ? '#6b908e' : '#8c5830', 0.01)
    p.position.set(DOOR_W / 2, y, 0.045)
    doorPivot.add(p)
  }
  const knob = ball(0.045, '#e8c15a')
  knob.position.set(DOOR_W - 0.14, 1.0, 0.08)
  doorPivot.add(knob)
  g.add(doorPivot)

  // Porch and step.
  const porch = box(2.6, 0.14, 1.3, villa ? '#d8d4cb' : '#a98258', 0.04)
  porch.position.set(0, 0.07, 0.6)
  g.add(porch)

  // Doorbell and sconce.
  const plate = box(0.16, 0.26, 0.04, '#3d4a55', 0.015)
  plate.position.set(1.05, 1.15, 0.05)
  g.add(plate)
  const bellBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb347', emissiveIntensity: 0.9 }))
  bellBtn.rotation.x = Math.PI / 2
  bellBtn.position.set(1.05, 1.15, 0.085)
  g.add(bellBtn)
  const sconce = cyl(0.07, 0.09, 0.2, '#3d4a55', 12)
  sconce.position.set(-1.05, 1.9, 0.12)
  g.add(sconce)
  const sconceGlow = ball(0.08, '#ffd9a0', { emissive: '#ffbf70', emissiveIntensity: 1.4 })
  sconceGlow.position.set(-1.05, 2.05, 0.12)
  g.add(sconceGlow)
  const sc = new THREE.PointLight('#ffc27a', 1.4, 6, 1.6)
  sc.position.set(-1.05, 2.05, 0.5)
  g.add(sc)
  lamps.push(sc)

  // Windows with warm glass.
  for (const x of [-1.9, 1.9]) {
    const frame = box(1.0, 0.95, 0.1, villa ? '#f6f3ec' : '#e8d9bb', 0.02)
    frame.position.set(x, 1.55, 0.02)
    g.add(frame)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.77), new THREE.MeshStandardMaterial({ color: '#ffe3b0', emissive: '#ffbf70', emissiveIntensity: 0.55, roughness: 0.2 }))
    glass.position.set(x, 1.55, 0.075)
    g.add(glass)
    const bar1 = box(0.04, 0.77, 0.03, '#e8d9bb', 0.005)
    bar1.position.set(x, 1.55, 0.09)
    const bar2 = box(0.82, 0.04, 0.03, '#e8d9bb', 0.005)
    bar2.position.set(x, 1.55, 0.09)
    g.add(bar1, bar2)
    const boxPlanter = box(1.0, 0.18, 0.22, '#a98258', 0.03)
    boxPlanter.position.set(x, 0.95, 0.18)
    g.add(boxPlanter)
    for (let i = 0; i < 4; i++) {
      const f = ball(0.07, ['#f08ab0', '#f7c948', '#ffffff', '#c58bd9'][i]!)
      f.position.set(x - 0.36 + i * 0.24, 1.1, 0.2)
      g.add(f)
    }
  }

  // Mailbox.
  const post = box(0.1, 0.9, 0.1, '#7d5233', 0.02)
  post.position.set(2.6, 0.45, 3.0)
  g.add(post)
  const mb = box(0.5, 0.3, 0.32, '#c25b4a', 0.08)
  mb.position.set(2.6, 1.0, 3.0)
  g.add(mb)
  const flag = box(0.04, 0.22, 0.04, '#ffd166', 0.005)
  flag.position.set(2.88, 1.1, 3.0)
  g.add(flag)

  // Trees, bushes, flowers.
  const tree = (x: number, z: number, s: number, c1: string, c2: string) => {
    const t = new THREE.Group()
    t.add(place(cyl(0.16, 0.22, 1.2, '#7d5233', 10), 0, 0.6, 0))
    t.add(place(ball(0.95, c1), 0, 1.7, 0))
    t.add(place(ball(0.7, c2), 0.4, 2.3, 0.1))
    t.add(place(ball(0.6, c2), -0.5, 2.0, -0.2))
    t.scale.setScalar(s)
    t.position.set(x, 0, z)
    t.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true
        c.receiveShadow = true
      }
    })
    g.add(t)
  }
  tree(-4.2, 1.2, 1.1, '#5f9d6a', '#74b27d')
  tree(4.4, -0.5, 1.0, '#6aa86e', '#84c084')
  tree(-3.2, -3.6, 1.3, '#548f61', '#6aa86e')
  tree(3.6, -4.2, 1.2, '#5f9d6a', '#74b27d')
  for (const [x, z, s] of [[-2.6, 0.5, 0.45], [2.7, 0.55, 0.5], [-2.2, 1.7, 0.35], [3.2, 1.6, 0.4]] as const) {
    const b = ball(1, '#5aa06a')
    b.scale.set(s, s * 0.8, s)
    b.position.set(x, s * 0.7, z)
    g.add(b)
  }
  const petals = ['#f08ab0', '#f7c948', '#ffffff', '#c58bd9']
  for (let i = 0; i < 26; i++) {
    const a = i * 2.399
    const r = 2.5 + (i % 7) * 0.6
    const f = ball(0.06, petals[i % 4]!)
    f.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r * 0.9 + 0.8)
    if (Math.abs(f.position.x) < 1.2 && f.position.z > 0.5) continue
    g.add(f)
  }

  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'PlaneGeometry') c.castShadow = false
  })

  return {
    group: g,
    doorPivot,
    bell: new THREE.Vector3(1.05, 1.15, 0.1),
    petSpot: new THREE.Vector3(0.7, 0.14, 0.9),
    doorway: new THREE.Vector3(0, 1.1, -0.4),
    lamps,
  }
}
