import * as THREE from 'three'
import { mat } from './materials.ts'

const GHOST_TINT: Record<string, string> = {
  white: '#ffffff',
  mint: '#cdeede',
  peach: '#ffd9c7',
  lilac: '#e0d3f6',
}

export type PetState = 'idle' | 'sleep' | 'react' | 'greet' | 'observe'

/** Places the pet likes to be (floor coordinates). */
export const SPOTS: Record<string, [number, number]> = {
  rug: [2.9, 3.2],
  desk: [2.6, 1.9],
  bed: [4.5, 3.5],
  door: [1.7, 4.5],
  shelf: [4.9, 1.5],
  window: [3.2, 1.3],
}

/**
 * The home's pet is the website ghost. It wanders between a few spots, sleeps on its bed after
 * a while, hops when something happens, and runs to the door for visitors. Local rules only.
 */
export class Pet {
  readonly group = new THREE.Group()
  private body: THREE.Group
  private shadow: THREE.Mesh
  private zzz: THREE.Group
  private target = new THREE.Vector3(2.9, 0, 3.2)
  private pos = new THREE.Vector3(2.9, 0, 3.2)
  private state: PetState = 'idle'
  private stateT = 0
  private nextMove = 1.5
  private hop = 0
  private still = false
  private bodyMat: THREE.MeshStandardMaterial
  private idleFor = 0
  /** True while the pet waits somewhere fixed (outside, for a visitor). */
  frozen = false
  private model: THREE.Group | null = null
  private modelMat: THREE.MeshStandardMaterial | null = null
  private mixer: THREE.AnimationMixer | null = null
  private actions = new Map<string, THREE.AnimationAction>()
  private playing = ''

  constructor(color: string, reduceMotion: boolean) {
    this.still = reduceMotion
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: GHOST_TINT[color] ?? '#ffffff',
      emissive: GHOST_TINT[color] ?? '#ffffff',
      emissiveIntensity: 0.18,
      roughness: 0.45,
    })
    this.body = new THREE.Group()
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2)
      pts.push(new THREE.Vector2(Math.sin(a) * 0.3, 0.38 + Math.cos(a) * 0.3))
    }
    pts.push(new THREE.Vector2(0.3, 0.1), new THREE.Vector2(0.3, -0.06), new THREE.Vector2(0.0, -0.06))
    const geo = new THREE.LatheGeometry(pts.reverse(), 40)
    const p = geo.attributes.position!
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0.12) {
        const ang = Math.atan2(p.getX(i), p.getZ(i))
        p.setY(i, p.getY(i) - 0.05 * Math.max(0, Math.sin(ang * 4)) + 0.02)
      }
    }
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, this.bodyMat)
    mesh.castShadow = true
    this.body.add(mesh)
    const eyeM = mat('#2a2a35', { roughness: 0.3 })
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), eyeM)
      eye.scale.set(0.9, 1.3, 0.6)
      eye.position.set(s * 0.1, 0.5, 0.27)
      this.body.add(eye)
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff' }))
      hl.position.set(s * 0.1 + 0.01, 0.52, 0.3)
      this.body.add(hl)
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: '#ffa6b8', transparent: true, opacity: 0.7 }))
      cheek.position.set(s * 0.19, 0.42, 0.24)
      cheek.rotation.y = s * 0.7
      this.body.add(cheek)
    }
    this.body.position.y = 0.3
    this.group.add(this.body)

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 20),
      new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.01
    this.group.add(this.shadow)

    this.zzz = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const z = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + i * 0.04, 0.12 + i * 0.04), new THREE.MeshBasicMaterial({ map: zTexture(), transparent: true, depthWrite: false }))
      z.position.set(0.25 + i * 0.1, 0.95 + i * 0.18, 0)
      this.zzz.add(z)
    }
    this.zzz.visible = false
    this.group.add(this.zzz)
    this.tokenMaterials = {heart: petToken('heart'), mail: petToken('mail')}
    this.token.material.dispose()
    this.token.material = this.tokenMaterials.heart
    this.token.visible = false
    this.group.add(this.token)
    this.group.userData.pick = 'pet'
    this.group.position.copy(this.pos)
  }

  setColor(color: string) {
    const c = GHOST_TINT[color] ?? '#ffffff'
    this.bodyMat.color.set(c)
    this.bodyMat.emissive.set(c)
    if (this.modelMat) {
      this.modelMat.color.set(c)
      this.modelMat.emissive.set(c)
    }
  }

  /**
   * Swaps the code-drawn body for the Blender ghost. Its clips (idle, move, sleep) play on the model;
   * walking, hops and the sleepy settle stay in code.
   */
  useModel(model: THREE.Group, clips: THREE.AnimationClip[]) {
    for (const c of [...this.body.children]) {
      this.body.remove(c)
      ;(c as THREE.Mesh).geometry?.dispose()
    }
    model.scale.setScalar(1.1)
    model.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true
      const mat = m.material as THREE.MeshStandardMaterial
      if (mat.name === 'cf1f4f9') {
        this.modelMat ??= mat.clone()
        this.modelMat.color.copy(this.bodyMat.color)
        this.modelMat.emissive.copy(this.bodyMat.emissive)
        this.modelMat.emissiveIntensity = 0.12
        m.material = this.modelMat
      }
    })
    this.body.add(model)
    this.body.position.y = 0
    this.model = model
    this.mixer = new THREE.AnimationMixer(model)
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip))
    this.play('idle', 0)
    this.mixer.update(0)
  }

  private play(name: string, fade = 0.35) {
    if (name === this.playing) return
    const next = this.actions.get(name)
    if (!next) return
    const prev = this.actions.get(this.playing)
    next.reset().setEffectiveWeight(1).play()
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false)
    else prev?.stop()
    this.playing = name
  }

  get current(): PetState {
    return this.state
  }

  /** Where the pet is, for camera focus. */
  get position(): THREE.Vector3 {
    return this.pos
  }

  goTo(spot: keyof typeof SPOTS) {
    const s = SPOTS[spot]!
    this.target.set(s[0], 0, s[1])
  }

  set(state: PetState) {
    this.state = state
    this.stateT = 0
    if (state === 'greet') this.goTo('rug')
    if (state === 'sleep') this.goTo('bed')
    if (state === 'react') this.hop = 1
  }

  /**
   * Walk over and keep the owner company at a spot (the desk while they write, the shelf while they read).
   * Gives up after `seconds`, or at once if the owner nudges the pet. Local rule, no randomness needed.
   */
  attend(spot: keyof typeof SPOTS, seconds = 8) {
    if (this.frozen || this.still) return
    this.goTo(spot)
    this.state = 'observe'
    this.stateT = 0
    this.observeFor = seconds
    this.idleFor = 0
  }

  private observeFor = 0
  private tokenTime = 0
  private token = new THREE.Sprite()
  private tokenMaterials: Record<'heart' | 'mail', THREE.SpriteMaterial>

  deliver() {
    this.token.material = this.tokenMaterials.mail
    this.tokenTime = 5
    this.attend('door', 5)
    this.nudge()
  }

  private waveTime=0
  private lookTime=0
  private lookYaw=0
  private lookPitch=0
  follow(x:number,y:number){if(this.still)return;this.lookTime=.5;this.lookYaw=(x-.5)*1.3;this.lookPitch=(y-.5)*.35}
  faceCue(cue:'smile'|'blink'|'left'|'right'){
    if(cue==='smile')this.respond('happy')
    else if(cue==='blink'){this.waveTime=.65;this.nudge()}
    else this.follow(cue==='left'?.15:.85,.5)
  }
  respond(reaction:'greet'|'come'|'catch-heart'|'happy'){
    if(reaction==='greet'){this.set('greet');this.waveTime=1.4;this.follow(.5,.5)}
    else if(reaction==='come'){this.attend('rug',5)}
    else {
      if (reaction === 'catch-heart') {
        this.token.material = this.tokenMaterials.heart
        this.tokenTime = 2
      }
      this.set('react')
    }
  }

  nudge() {
    this.idleFor = 0
    if (this.state === 'sleep') this.set('idle')
    this.hop = 1
  }

  /** Teleports (for the visitor's arrival). */
  placeXZ(x: number, z: number, y = 0) {
    this.pos.set(x, 0, z)
    this.target.copy(this.pos)
    this.group.position.set(x, y, z)
  }

  placeAt(spot: keyof typeof SPOTS) {
    this.group.position.y = 0
    const s = SPOTS[spot]!
    this.pos.set(s[0], 0, s[1])
    this.target.copy(this.pos)
    this.group.position.copy(this.pos)
  }

  update(dt: number, t: number) {
    this.stateT += dt
    this.idleFor += dt
    if (this.frozen) this.target.copy(this.pos)
    const toTarget = this.target.clone().sub(this.pos)
    const dist = toTarget.length()
    const moving = !this.still && dist > 0.05
    if (moving) {
      const speed = this.state === 'greet' ? 1.6 : 0.7
      this.pos.addScaledVector(toTarget.normalize(), Math.min(dist, speed * dt))
      const want = Math.atan2(toTarget.x, toTarget.z)
      let d = want - this.body.rotation.y
      d = Math.atan2(Math.sin(d), Math.cos(d))
      this.body.rotation.y += d * Math.min(1, dt * 6)
    } else if (this.still) {
      this.pos.copy(this.target)
    }
    this.group.position.x = this.pos.x
    this.group.position.z = this.pos.z

    // Wander or doze.
    if (this.state === 'idle' && !this.frozen) {
      this.nextMove -= dt
      if (this.nextMove <= 0 && !this.still) {
        const names = Object.keys(SPOTS).filter((n) => n !== 'bed')
        this.goTo(names[Math.floor(Math.random() * names.length)] as keyof typeof SPOTS)
        this.nextMove = 4 + Math.random() * 5
      }
      if (this.idleFor > 40 && !this.still) this.set('sleep')
    } else if (this.state === 'observe') {
      this.idleFor = 0 // a pet that is keeping company does not doze off
      if (this.stateT > this.observeFor) this.set('idle')
    } else if (this.state === 'react' && this.stateT > 1.5) {
      this.set('idle')
    } else if (this.state === 'greet' && !moving && this.stateT > 3) {
      this.set('idle')
    }

    this.tokenTime = Math.max(0, this.tokenTime - dt)
    this.token.visible = this.tokenTime > 0
    const catching = this.token.material === this.tokenMaterials.heart
    const approach = catching && !this.still ? Math.max(0, this.tokenTime - 1.3) : 0
    this.token.position.set(.22 + approach * .5, .79 + approach, .24)
    this.token.scale.setScalar(.4 * Math.min(1, this.tokenTime * 4))
    this.waveTime=Math.max(0,this.waveTime-dt)
    this.lookTime=Math.max(0,this.lookTime-dt)
    this.body.rotation.z=this.still?0:Math.sin(this.waveTime*17)*Math.min(.24,this.waveTime)
    this.body.rotation.x+=( (this.lookTime?this.lookPitch:0)-this.body.rotation.x)*Math.min(1,dt*7)
    if(this.lookTime)this.body.rotation.y+=(this.lookYaw-this.body.rotation.y)*Math.min(1,dt*8)
    const sleeping = this.state === 'sleep'
    this.hop = Math.max(0, this.hop - dt * 2.2)
    const hopY = Math.sin(this.hop * Math.PI) * 0.35
    if (this.model && this.mixer) {
      // the clips carry the float, lean, blink and breathing
      this.play(sleeping && !moving ? 'sleep' : moving ? 'move' : 'idle')
      if (!this.still) this.mixer.update(dt)
      this.body.position.y = 0.02 + hopY
      this.shadow.scale.setScalar(1.25 - hopY * 0.8)
      this.zzz.visible = sleeping && !moving
      if (this.zzz.visible) this.zzz.position.y = -0.2 + (t % 2) * 0.12
      return
    }
    const bob = this.still ? 0 : Math.sin(t * (sleeping ? 1.2 : 2.4)) * (sleeping ? 0.015 : 0.04)
    const settle = sleeping && !moving ? -0.12 : 0
    this.body.position.y = 0.32 + bob + hopY + settle
    this.body.scale.setScalar(sleeping ? 0.92 : 1 + (this.still ? 0 : Math.sin(t * 2.4) * 0.015))
    this.shadow.scale.setScalar(1 - hopY * 0.8)
    this.zzz.visible = sleeping && !moving
    if (this.zzz.visible) this.zzz.position.y = (t % 2) * 0.12
  }
}

function zTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#7b8bb5'
  g.lineWidth = 4
  g.font = 'bold 54px sans-serif'
  g.textAlign = 'center'
  g.strokeText('z', 32, 48)
  g.fillText('z', 32, 48)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function petToken(kind: 'heart' | 'mail') {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const g = canvas.getContext('2d')!
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = 'bold 100px sans-serif'
  g.lineWidth = 7
  g.strokeStyle = '#fff5dc'
  g.fillStyle = kind === 'heart' ? '#ca3859' : '#914c2d'
  const glyph = kind === 'heart' ? '♥' : '✉'
  g.strokeText(glyph, 64, 68)
  g.fillText(glyph, 64, 68)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  return new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false })
}
