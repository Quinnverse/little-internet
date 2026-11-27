import * as THREE from 'three'
import { ball, box, mat } from './materials.ts'

/**
 * The owner's little avatar — a distinct character from the ghost pet (Boo).
 * Pure code geometry, no external asset, so it stays small and always loads.
 * It walks to a tapped floor cell, turns toward where it is going, swings its
 * legs while moving and settles when it arrives. The pet can follow it.
 */
const SKIN = '#f2d3b3'
const SHIRT = '#e08a5d'
const SHIRT_ALT = '#7fa8b8'
const HAIR = '#4a3428'
const PANTS = '#54617a'

export class Avatar {
  readonly group = new THREE.Group()
  private body = new THREE.Group()
  private legL: THREE.Mesh
  private legR: THREE.Mesh
  private armL: THREE.Group
  private armR: THREE.Group
  private shadow: THREE.Mesh
  private shirtMat: THREE.MeshStandardMaterial
  private target = new THREE.Vector3(3, 0, 3.2)
  private pos = new THREE.Vector3(3, 0, 3.2)
  private heading = Math.PI
  private walk = 0
  private still: boolean
  private arrived = 0

  constructor(reduceMotion: boolean, variant: 'warm' | 'cool' = 'warm') {
    this.still = reduceMotion
    this.shirtMat = mat(variant === 'warm' ? SHIRT : SHIRT_ALT, { roughness: 0.75 })

    // Torso: a soft rounded box so it reads as a toy figure next to the low-poly furniture.
    const torso = box(0.42, 0.46, 0.3, this.shirtMat.color.getStyle(), 0.1)
    ;(torso.material as THREE.MeshStandardMaterial).dispose()
    torso.material = this.shirtMat
    torso.position.y = 0.62
    this.body.add(torso)

    // Head, hair cap, eyes and a tiny smile.
    const head = ball(0.2, SKIN)
    head.position.y = 1.02
    this.body.add(head)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(HAIR))
    hair.position.y = 1.03
    hair.castShadow = true
    this.body.add(hair)
    const eyeM = mat('#2a2a35', { roughness: 0.3 })
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), eyeM)
      eye.scale.set(0.85, 1.25, 0.6)
      eye.position.set(s * 0.075, 1.03, 0.185)
      this.body.add(eye)
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 14, Math.PI), mat('#a85a4a'))
    smile.position.set(0, 0.985, 0.192)
    smile.rotation.z = Math.PI
    this.body.add(smile)

    // Arms pivot from the shoulder so they can swing opposite the legs.
    this.armL = new THREE.Group()
    this.armR = new THREE.Group()
    for (const [g, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      const arm = box(0.1, 0.3, 0.1, this.shirtMat.color.getStyle(), 0.045)
      ;(arm.material as THREE.MeshStandardMaterial).dispose()
      arm.material = this.shirtMat
      arm.position.y = -0.14
      const hand = ball(0.06, SKIN)
      hand.position.y = -0.31
      g.add(arm, hand)
      g.position.set(s * 0.27, 0.78, 0)
      this.body.add(g)
    }

    // Legs swing from the hip.
    this.legL = box(0.13, 0.34, 0.14, PANTS, 0.05)
    this.legR = box(0.13, 0.34, 0.14, PANTS, 0.05)
    this.legL.position.set(-0.1, 0.19, 0)
    this.legR.position.set(0.1, 0.19, 0)
    const pivotL = new THREE.Group()
    const pivotR = new THREE.Group()
    pivotL.position.set(-0.1, 0.36, 0)
    pivotR.position.set(0.1, 0.36, 0)
    this.legL.position.set(0, -0.18, 0)
    this.legR.position.set(0, -0.18, 0)
    pivotL.add(this.legL)
    pivotR.add(this.legR)
    this.legL.userData.pivot = pivotL
    this.legR.userData.pivot = pivotR
    this.body.add(pivotL, pivotR)

    this.group.add(this.body)
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 20),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.2, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.012
    this.group.add(this.shadow)
    this.group.userData.pick = 'avatar'
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.heading
  }

  get position(): THREE.Vector3 {
    return this.pos
  }

  get moving(): boolean {
    return this.pos.distanceTo(this.target) > 0.06
  }

  /** Walk to a floor position (world x/z within the 0..6 room). */
  goTo(x: number, z: number) {
    this.target.set(x, 0, z)
  }

  /** Instant placement (entry / reset). */
  place(x: number, z: number) {
    this.pos.set(x, 0, z)
    this.target.copy(this.pos)
    this.group.position.set(x, 0, z)
  }

  setVariant(variant: 'warm' | 'cool') {
    this.shirtMat.color.set(variant === 'warm' ? SHIRT : SHIRT_ALT)
  }

  update(dt: number, t: number) {
    this.arrived = Math.max(0, this.arrived - dt)
    const to = this.target.clone().sub(this.pos)
    const dist = to.length()
    const moving = !this.still && dist > 0.06
    if (moving) {
      const speed = 1.35
      this.pos.addScaledVector(to.normalize(), Math.min(dist, speed * dt))
      const want = Math.atan2(to.x, to.z)
      let d = want - this.heading
      d = Math.atan2(Math.sin(d), Math.cos(d))
      this.heading += d * Math.min(1, dt * 9)
      this.walk += dt * 11
      this.arrived = 0.32
    } else {
      this.pos.copy(this.target)
      this.walk += dt * 1.2
    }
    this.group.position.x = this.pos.x
    this.group.position.z = this.pos.z
    this.group.rotation.y = this.heading

    const swing = moving ? Math.sin(this.walk) * 0.6 : 0
    const pivotL = this.legL.userData.pivot as THREE.Group
    const pivotR = this.legR.userData.pivot as THREE.Group
    pivotL.rotation.x = swing
    pivotR.rotation.x = -swing
    this.armL.rotation.x = -swing * 0.7
    this.armR.rotation.x = swing * 0.7
    const bob = moving ? Math.abs(Math.sin(this.walk)) * 0.045 : Math.sin(t * 1.6) * 0.008
    const hop = this.arrived > 0 ? Math.sin((0.32 - this.arrived) / 0.32 * Math.PI) * 0.09 : 0
    this.body.position.y = bob + hop
    this.shadow.scale.setScalar(1 - hop * 1.4)
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry?.dispose()
        const mm = m.material as THREE.Material | THREE.Material[]
        if (mm !== this.shirtMat) {
          if (Array.isArray(mm)) mm.forEach((x) => x.dispose())
          else mm?.dispose()
        }
      }
    })
    this.shirtMat.dispose()
  }
}
