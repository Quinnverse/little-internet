import {windowLandscape} from './landscape.ts'
import {LetterLights} from './letterLights.ts'
import {boardTexture,type PinView} from './pinboard.ts'
import * as THREE from 'three'
import { primeSound, sfx, startAmbient } from '../editor/ui/sfx.ts'
import { createPipeline, type Pipeline } from './pipeline.ts'
import {
  FLOOR_SIZE,
  isReservedCell,
  type DecorKind,
  type FloorId,
  type House,
  type LightMode,
  type MemoryKind,
  type WallId,
} from '../core/room.ts'
import {
  buildAnsweringTable,
  buildChair,
  buildDecor,
  buildDesk,
  buildMemory,
  buildPetBed,
  buildRug,
  buildShelf,
  buildShell,
  type BuildCtx,
  type Shell,
} from './builders.ts'
import { buildExterior, type Exterior } from './exterior.ts'
import { kitDecor, kitExterior, kitExteriorGlows, kitFurniture, kitMemory, kitShell } from './kit.ts'
import { getAnimations, getModel, kitReady } from './models.ts'
import { glowTexture } from './materials.ts'
import { Avatar } from './avatar.ts'
import { box } from './materials.ts'
import { Pet, type PetState } from './pet.ts'
import { SLOT_POSES } from './slots.ts'

export type HomeData = {
  period?: string; lampsOn?:boolean; lightTrigger?:string
  outfit?:'warm'|'cool'|'hidden';pins?:PinView[];sign?:string
  house: House
  wall: WallId
  floor: FloorId
  light: LightMode
  decor: { id: string; kind: DecorKind; x: number; z: number; rot: number }[]
  memory: { id: string; kind: MemoryKind; slot: string; title: string; thumbUrl?: string }[]
  welcome: boolean
  pet: { enabled: boolean; name: string; color: string }
}

export type ViewOptions = {
  /** Container that holds the canvas (position: relative). */
  container: HTMLElement
  /** Layer for DOM hotspots, normally the same as the container. */
  label: (id: string) => string
  /** Optional inline SVG for a hotspot's dot. */
  icon?: (id: string) => string
  onPick: (id: string) => void
  onCell?: (x: number, z: number) => void
  /** Ids that get a visible hotspot button. Memory objects are added automatically. */
  hotspots: string[]
  ownerAvatar?: boolean
  reduceMotion: boolean
  onHover?: (id: string | null) => void
  /** The GPU context was lost and could not be restored in time; show the owner a real choice. */
  onContextLost?: () => void
  /** The GPU context came back and the scene was redrawn. */
  onContextRestored?: () => void
}

type Hot = { id: string; el: HTMLButtonElement; anchor: () => THREE.Vector3; wall?: number }

const TARGET = new THREE.Vector3(3, 1.0, 3)
/** Closest the camera may get to its target: close enough to read a diary page or a mug's pattern. */
const MIN_RADIUS = 1.1
/** The camera target stays inside the house, so panning can never lose the room. */
const PAN_MIN = new THREE.Vector3(-0.5, 0.05, -0.5)
const PAN_MAX = new THREE.Vector3(6.5, 2.4, 6.5)
const TIP_SIDE: Record<string, string> = { diary: 'left', computer: 'top', shelf: 'top', voice: 'left' }
const ANCHORS: Record<string, [number, number, number]> = {
  records:[3,1,.36],wall:[1,1.9,.05],calendar:[.1,2.3,.5],
  diary: [0.62, 1.05, 0.5],
  computer: [1.4, 1.5, 0.45],
  voice: [0.4, 1.0, 2.4],
  shelf: [5.0, 2.85, 0.3],
  window: [3.2, 1.85, 0.1],
  door: [0.05, 1.25, 4.5],
}

export function isNightNow(mode: LightMode, hour = new Date().getHours()): boolean {
  if (mode === 'day') return false
  if (mode === 'night') return true
  return hour < 6 || hour >= 18
}

export class RoomView {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.04, 80)
  private avatar?: Avatar
  readonly pet: Pet
  private opts: ViewOptions
  private root = new THREE.Group()
  private dynamic = new THREE.Group()
  private shell!: Shell
  private ctx: BuildCtx = { lamps: [], glows: [] }
  private sun = new THREE.DirectionalLight('#ffd9a8', 3.2)
  private hemi = new THREE.HemisphereLight('#cfe2f2', '#6b5a45', 0.42)
  private ambient = new THREE.AmbientLight('#ffe9cf', 0.1)
  /** Cool light from the far corner: gives every piece of furniture a readable edge instead of a flat silhouette. */
  private rim = new THREE.DirectionalLight('#b9d4ee', 0.55)
  /** Slow dust in the air. Cheap, but it is most of what makes a still room feel inhabited. */
  private dust?: THREE.Points
  private pipeline?: Pipeline
  private data: HomeData | null = null
  private night = false
  private nightMix = 0
  private led: THREE.MeshStandardMaterial | null = null
  private hots: Hot[] = []
  private hotLayer: HTMLElement
  private last = performance.now()
  private elapsed = 0
  private raf = 0
  private disposed = false
  private dirty = true
  private visible = true
  private ro: ResizeObserver
  private io: IntersectionObserver
  private raycaster = new THREE.Raycaster()
  /** Soft light that rides with the camera and fades in when you zoom close, so details stay readable. */
  private fill = new THREE.PointLight('#fff1dc', 0, 9, 1.4)
  private pickRoots: THREE.Object3D[] = []
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private decorMode = false
  private grid = new THREE.Group()
  private selected: string | null = null
  private ring: THREE.Mesh
  private objects = new Map<string, THREE.Object3D>()
  private doorOpen = 0
  private doorTarget = 0
  private lastHover: string | null = null
  private ext: Exterior | null = null
  private kitUsed = false
  /** Hotspot positions read from the models' hs_* empties. */
  private anchorsKit = new Map<string, THREE.Vector3>()
  private staticLamps = 0
  private staticGlows = 0
  readonly softwareRenderer: boolean
  private lastShadowUpdate = -Infinity
  private mode: 'home' | 'exterior' = 'home'
  private extDoor = 0
  private extDoorTarget = 0
  private hotIds: string[]
  private extraAnchors = new Map<string, THREE.Vector3>()

  // Camera rig
  private az = Math.PI / 4
  private pol = 1.0
  private radius = 12
  private tgt = TARGET.clone()
  private want = { az: Math.PI / 4, pol: 1.0, radius: 12, tgt: TARGET.clone() }
  private vAz = 0
  private baseRadius = 12
  private basePol = 1.0
  private pointers = new Map<number, { x: number; y: number }>()
  private pinch = 0
  private downAt = { x: 0, y: 0, t: 0 }
  private moved = 0
  private panning = false
  private lastTap = { t: 0, x: 0, y: 0 }
  private mid = { x: 0, y: 0 }

  constructor(opts: ViewOptions) {
    this.opts = opts
    this.hotIds = opts.hotspots
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
    const gl = this.renderer.getContext()
    const debugRenderer = gl.getExtension('WEBGL_debug_renderer_info')
    const rendererName = debugRenderer ? String(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)) : ''
    const software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(rendererName)
    this.softwareRenderer = software
    this.renderer.setPixelRatio(software ? 0.75 : Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = !software
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.pipeline = software
      ? undefined
      : createPipeline(this.renderer, this.scene, this.camera, {
          w: opts.container.clientWidth || 1,
          h: opts.container.clientHeight || 1,
          dpr: this.renderer.getPixelRatio(),
        })
    const el = this.renderer.domElement
    el.className = 'room-canvas'
    el.style.touchAction = 'none'
    el.setAttribute('aria-hidden', 'true')
    opts.container.prepend(el)
    this.hotLayer = opts.container

    this.scene.add(this.root, this.dynamic, this.hemi, this.ambient, this.sun, this.sun.target, this.fill, this.rim, this.rim.target)
    this.sun.position.set(8, 9, -8)
    this.sun.target.position.set(3, 0, 3)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const sc = this.sun.shadow.camera
    sc.left = -9
    sc.right = 9
    sc.top = 9
    sc.bottom = -9
    sc.near = 1
    sc.far = 40
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.02
    this.sun.shadow.radius = 5
    // The cool rim sits opposite the window, so the light has a direction across the room.
    this.rim.position.set(-5.5, 4.2, 10)
    this.rim.target.position.set(3, 1.2, 3)
    this.rim.castShadow = false
    this.makeDust()

    this.pet = new Pet('white', opts.reduceMotion)
    if (kitReady()) this.pet.useModel(getModel('pet_ghost')!, getAnimations('pet_ghost'))
    this.scene.add(this.pet.group)
    if(opts.ownerAvatar){this.avatar=new Avatar(opts.reduceMotion);this.avatar.place(4.55,2.9);this.scene.add(this.avatar.group)}
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.42, 36),
      new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.95, depthWrite: false }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.visible = false
    this.scene.add(this.ring, this.grid)
    this.grid.visible = false

    // Phones drop WebGL contexts when the tab is backgrounded or memory is tight. preventDefault on `lost`
    // tells the browser we want it back; on `restored` three.js rebuilds GPU resources and we redraw.
    el.addEventListener('webglcontextlost', this.onLost)
    el.addEventListener('webglcontextrestored', this.onRestored)
    el.addEventListener('contextmenu', (ev) => ev.preventDefault())
    el.addEventListener('pointerdown', this.onDown)
    // Browsers only allow audio after a real gesture; latch onto the first one.
        el.addEventListener('pointerdown', () => {
      primeSound()
      startAmbient()
    }, { once: true })
    el.addEventListener('pointermove', this.onMove)
    el.addEventListener('pointerup', this.onUp)
    el.addEventListener('pointercancel', this.onUp)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(opts.container)
    this.io = new IntersectionObserver((e) => {
      this.visible = e[0]?.isIntersecting ?? true
      if (this.visible) this.dirty = true
    })
    this.io.observe(opts.container)
    document.addEventListener('visibilitychange', this.onVis)
    this.resize()
    this.loop()
  }

  // ---------------------------------------------------------------- data

  setData(data: HomeData) {
    const prev = this.data
    this.data = data
    this.pet.setColor(data.pet.color)
    this.pet.group.visible = data.pet.enabled
    const skinChanged =
      !prev || prev.house !== data.house || prev.wall !== data.wall || prev.floor !== data.floor || prev.welcome !== data.welcome || this.kitUsed !== kitReady()
    if (skinChanged) this.buildStatic(data)
    if(this.avatar){this.avatar.group.visible=this.mode==='home'&&data.outfit!=='hidden';this.avatar.setVariant(data.outfit==='cool'?'cool':'warm')}
    if(skinChanged || prev?.sign!==data.sign){
      if(this.stringLights){
        const old=this.stringLights.group
        this.pickRoots=this.pickRoots.filter(obj=>obj!==old)
        old.removeFromParent()
        if(!skinChanged)disposeTree(old)
      }
      this.stringLights=new LetterLights(data.sign||'HOME')
      const group=this.stringLights.group
      group.rotation.y=-Math.PI/2
      group.position.set((data.house==='villa'?8.52:6)-.06,2.22,2.85)
      this.root.add(group)
      this.pickRoots.push(group)
      if(!data.lightTrigger||data.lightTrigger==='enter')this.replayLights()
    }
    if(prev?.lampsOn===false && data.lampsOn!==false && data.lightTrigger==='lamps')this.replayLights()
    this.stringLights?.lights(data.lampsOn!==false)
    if (prev && prev.lampsOn !== data.lampsOn) sfx(data.lampsOn === false ? 'lampOff' : 'lamp')
    if(skinChanged || prev?.pins!==data.pins)this.refreshBoard(data)
    this.buildDynamic(data)
    this.lampsOn=data.lampsOn??true
    if(data.period)this.roomHour(data.period)
    else this.setNight(isNightNow(data.light), true)
    const pane=this.root.getObjectByName('view-through-window') as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>|undefined
    const period=data.period&&data.period!=='auto'?data.period:this.night?'midnight':'afternoon'
    if(pane&&pane.userData.period!==period){
      pane.userData.period=period;pane.material.map?.dispose()
      const tex=new THREE.CanvasTexture(windowLandscape(512,512,period));tex.colorSpace=THREE.SRGBColorSpace
      pane.material.map=tex;pane.material.needsUpdate=true
    }
    this.buildHotspots()
    this.dirty = true
  }

  private stringLights?:LetterLights
  replayLights(){this.stringLights?.play(performance.now());this.dirty=true}

  private boardEpoch=0
  private board?:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>
  private async refreshBoard(data:HomeData){
    const epoch=++this.boardEpoch
    if(this.board){this.board.removeFromParent();this.board.geometry.dispose();this.board.material.map?.dispose();this.board.material.dispose();this.board=undefined}
    if(!data.pins?.length)return
    const texture=await boardTexture(data.pins??[])
    if(epoch!==this.boardEpoch||this.disposed){texture.dispose();return}
    this.board=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.9),new THREE.MeshStandardMaterial({map:texture,roughness:.95}))
    this.board.position.set(1,1.93,.14);this.board.userData.pick='wall'
    this.root.add(this.board);this.dirty=true
  }

  private route:{x:number;z:number}[]=[]
  private walkTo(x:number,z:number){
    if(!this.avatar)return
    const pos=this.avatar.position
    const start={x:Math.floor(pos.x),z:Math.floor(pos.z)}
    const paths=[[start]],visited=new Set([start.x+','+start.z])
    for(const path of paths){
      const last=path[path.length-1]!
      if(last.x===x&&last.z===z){this.route=path.slice(1);this.avatar.goTo(start.x+.5,start.z+.5);return}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
        const nx=last.x+dx,nz=last.z+dz,key=nx+','+nz
        if(nx<0||nz<0||nx>=FLOOR_SIZE||nz>=FLOOR_SIZE||visited.has(key)||isReservedCell(nx,nz)||this.data?.decor.some(d=>d.x===nx&&d.z===nz))continue
        visited.add(key);paths.push([...path,{x:nx,z:nz}])
      }
    }
  }
  private extendVilla(house:House) {
    if(house!=='villa')return
    this.shell.group.scale.x=1.42
    for(const wall of this.shell.walls)wall.point.x*=1.42
    // A raised reading alcove spans the added bay, with steps facing the main room.
    const platform=box(1.85,.26,3.2,'#c5976a',.04)
    platform.position.set(7.35,.13,2.05)
    const step=box(.35,.13,2.1,'#d2ad82',.025)
    step.position.set(6.26,.065,2.05)
    const seat=box(1.24,.32,.74,'#aab398',.09)
    seat.position.set(7.4,.42,1.24)
    this.root.add(platform,step,seat)
  }

  private buildStatic(data: HomeData) {
    disposeTree(this.root)
    this.root.clear()
    this.ctx.lamps.length = 0
    this.ctx.glows.length = 0
    this.pickRoots = []
    this.anchorsKit.clear()
    this.kitUsed = kitReady()
    if (this.kitUsed) {
      // Blender models (assets/blender). The code-drawn version below is the fallback.
      this.shell = kitShell(data.house, data.wall, data.floor, this.ctx)
      this.extendVilla(data.house)
    this.root.add(this.shell.group)
      const f = kitFurniture(this.ctx, data.welcome)
      this.led = f.led
      this.root.add(f.group)
      this.pickRoots.push(...f.picks, this.shell.doorPivot)
      const glass = this.shell.walls[0]!.group.getObjectByName('window_glass')
      if (glass) this.pickRoots.push(glass)
      this.root.updateMatrixWorld(true)
      const HS: Record<string, string> = { diary: 'hs_diary', computer: 'hs_computer', voice: 'hs_voice', shelf: 'hs_shelf', window: 'hs_window', door: 'hs_door', export: 'hs_export' }
      for (const [id, n] of Object.entries(HS)) {
        const o = this.root.getObjectByName(n)
        if (o) this.anchorsKit.set(id, o.getWorldPosition(new THREE.Vector3()))
      }
      this.doorTarget = this.doorOpen
      this.staticLamps = this.ctx.lamps.length
      this.staticGlows = this.ctx.glows.length
      return
    }
    this.shell = buildShell(data.house, data.wall, data.floor, this.ctx)
    this.extendVilla(data.house)
    this.root.add(this.shell.group)
    const desk = buildDesk(this.ctx)
    const chair = buildChair()
    const shelf = buildShelf()
    const table = buildAnsweringTable(this.ctx, data.welcome)
    const bed = buildPetBed()
    const rug = buildRug(data.wall)
    this.led = table.led
    this.root.add(desk, chair, shelf, table.group, bed, rug)
    this.pickRoots.push(desk, shelf, table.group, bed)
    // Door pivot and window hit area live inside the wall groups.
    this.pickRoots.push(this.shell.doorPivot)
    this.shell.walls[0]!.group.traverse((o) => {
      if (o.userData.pick === 'window') this.pickRoots.push(o)
    })
    this.doorTarget = this.doorOpen
    this.staticLamps = this.ctx.lamps.length
    this.staticGlows = this.ctx.glows.length
  }

  private buildDynamic(data: HomeData) {
    // Remove old dynamic content; lamps and glows registered by static parts stay.
    this.ctx.lamps.length = this.staticLamps
    this.ctx.glows.length = this.staticGlows
    this.pickRoots = this.pickRoots.filter((o) => !o.userData.dyn)
    disposeTree(this.dynamic)
    this.dynamic.clear()
    this.objects.clear()
    for (const d of data.decor) {
      const g = new THREE.Group()
      g.add(this.kitUsed ? kitDecor(d.kind, this.ctx) : buildDecor(d.kind, this.ctx))
      g.position.set(d.x + 0.5, 0, d.z + 0.5)
      g.rotation.y = (d.rot * Math.PI) / 2
      g.userData.pick = `decor:${d.id}`
      g.userData.dyn = true
      this.dynamic.add(g)
      this.pickRoots.push(g)
      this.objects.set(`decor:${d.id}`, g)
    }
    for (const m of data.memory) {
      const pose = SLOT_POSES[m.slot]
      if (!pose) continue
      const look = { title: m.title }
      const g = new THREE.Group()
      g.add(this.kitUsed ? kitMemory(m.kind, look, this.ctx) : buildMemory(m.kind, look, this.ctx))
      g.position.set(pose.x, pose.y, pose.z)
      g.rotation.y = pose.rotY
      g.userData.pick = `memory:${m.id}`
      g.userData.dyn = true
      this.dynamic.add(g)
      this.pickRoots.push(g)
      this.objects.set(`memory:${m.id}`, g)
      if (m.thumbUrl) this.loadThumb(g, m.thumbUrl)
    }
    this.rebuildGrid()
    this.updateSelection()
  }

  private loadThumb(g: THREE.Object3D, url: string) {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        if(this.disposed||!g.parent){tex.dispose();return}
        tex.colorSpace = THREE.SRGBColorSpace
        const img = tex.image as { width: number; height: number }
        g.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.userData.face || !m.isMesh) return
          m.geometry.computeBoundingBox()
          const size = m.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(m.scale)
          const want = size.x / Math.max(size.y, 1e-6)
          const have = img.width / img.height
          if (have > want) {
            tex.repeat.set(want / have, 1)
            tex.offset.set((1 - want / have) / 2, 0)
          } else {
            tex.repeat.set(1, have / want)
            tex.offset.set(0, (1 - have / want) / 2)
          }
          ;(m.material as THREE.MeshStandardMaterial).map?.dispose()
          ;(m.material as THREE.MeshStandardMaterial).map = tex
          ;(m.material as THREE.MeshStandardMaterial).needsUpdate = true
        })
        this.dirty = true
      },
      undefined,
      () => undefined,
    )
  }

  // ---------------------------------------------------------------- hotspots

  private buildHotspots() {
    for (const h of this.hots) h.el.remove()
    this.hots = []
    const mk = (id: string, anchor: () => THREE.Vector3, small = false, wall?: number) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `hotspot${small ? ' hotspot-small' : ''}`
      el.dataset.id = id
      if (TIP_SIDE[id]) el.dataset.tip = TIP_SIDE[id]!
      el.setAttribute('aria-label', this.opts.label(id))
      el.innerHTML = `<span class="hot-dot">${this.opts.icon?.(id) ?? ''}</span><span class="hot-tip"></span>`
      ;(el.querySelector('.hot-tip') as HTMLElement).textContent = this.opts.label(id)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        this.opts.onPick(id)
      })
      el.addEventListener('pointerenter', () => this.hover(id))
      el.addEventListener('pointerleave', () => this.hover(null))
      el.addEventListener('focus', () => this.hover(id))
      el.addEventListener('blur', () => this.hover(null))
      // Let drags through to the canvas.
      this.hotLayer.appendChild(el)
      this.hots.push({ id, el, anchor, wall })
    }
    for (const id of this.hotIds) {
      const extra = this.extraAnchors.get(id)
      if (extra) mk(id, () => extra.clone())
      else if (id === 'pet') {
        mk(id, () => new THREE.Vector3(this.pet.position.x, (this.mode === 'exterior' ? 0.14 : 0) + 1.05, this.pet.position.z))
      } else {
        const k = this.anchorsKit.get(id)
        const a = ANCHORS[id]
        const at = k ?? (a ? new THREE.Vector3(...a) : null)
        if (at) mk(id, () => at.clone(), false, id === 'window' ? 0 : id === 'door' ? 1 : undefined)
      }
    }
    if (this.mode === 'home') for (const m of this.data?.memory ?? []) {
      const pose = SLOT_POSES[m.slot]
      if (!pose) continue
      mk(`memory:${m.id}`, () => new THREE.Vector3(pose.x, pose.y + 0.28, pose.z), true, pose.wall ? 1 : undefined)
    }
  }

  /** Rebuilds the hotspot buttons (after a language change). */
  refreshHotspots() {
    this.buildHotspots()
    this.dirty = true
  }

  private hover(id: string | null) {
    if (this.lastHover === id) return
    this.lastHover = id
    for (const h of this.hots) h.el.classList.toggle('is-hover', h.id === id)
    this.setGlow(id)
    this.opts.onHover?.(id)
    this.dirty = true
  }

  private findRoot(id: string): THREE.Object3D | undefined {
    return id === 'pet' ? this.pet.group : this.pickRoots.find((r) => r.userData.pick === id)
  }

  private setGlow(id: string | null) {
    const paint = (root: THREE.Object3D, on: boolean) =>
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (!m || !('emissive' in m)) return
        if (!m.userData.baseEmissive) m.userData.baseEmissive = { c: m.emissive.clone(), i: m.emissiveIntensity }
        const b = m.userData.baseEmissive as { c: THREE.Color; i: number }
        if (on) {
          m.emissive.set('#ffd9a0')
          m.emissiveIntensity = Math.max(b.i, 0.28)
        } else {
          m.emissive.copy(b.c)
          m.emissiveIntensity = b.i
        }
      })
    if (this.glowing) {
      const old = this.findRoot(this.glowing)
      if (old) paint(old, false)
      this.glowing = null
    }
    if (!id || id === 'door' || id === 'window') return
    const root = this.findRoot(id)
    if (root) {
      paint(root, true)
      this.glowing = id
    }
  }
  private glowing: string | null = null

  private updateHotspots() {
    if (!this.hots.length) return
    const w = this.renderer.domElement.clientWidth
    const h = this.renderer.domElement.clientHeight
    for (const hot of this.hots) {
      const p = hot.anchor().project(this.camera)
      let show = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05
      if (hot.wall !== undefined) show = show && (this.shell.walls[hot.wall]?.alpha ?? 1) > 0.6
      if (this.decorMode && !hot.id.startsWith('memory:')) show = false
      hot.el.style.display = show ? '' : 'none'
      if (show) {
        const px = ((p.x + 1) / 2) * w
        hot.el.style.transform = `translate(${px}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -50%)`
        // Keep the name tag inside the screen: shift it away from the edge it would cross.
        const half = Math.min(80, hot.el.dataset.tip ? 0 : 70)
        const shift = half ? (px < half + 6 ? half + 6 - px : px > w - half - 6 ? w - half - 6 - px : 0) : 0
        hot.el.style.setProperty('--tip-shift', `${Math.round(shift)}px`)
        if (hot.el.dataset.tip === 'left') hot.el.toggleAttribute('data-flip', px < 150)
      }
    }
  }

  // ---------------------------------------------------------------- modes and selection

  setDecorMode(on: boolean) {
    this.decorMode = on
    this.grid.visible = on
    if (!on) this.select(null)
    this.updateHotspots()
    this.dirty = true
  }

  select(id: string | null) {
    this.selected = id
    this.updateSelection()
    this.dirty = true
  }

  private updateSelection() {
    const o = this.selected ? this.objects.get(this.selected) : undefined
    this.ring.visible = !!o
    if (o) this.ring.position.set(o.position.x, 0.03 + (o.position.y > 0.2 ? o.position.y - 0.02 : 0), o.position.z)
  }

  private rebuildGrid() {
    disposeTree(this.grid)
    this.grid.clear()
    const taken = new Set((this.data?.decor ?? []).map((d) => `${d.x},${d.z}`))
    for (let z = 0; z < FLOOR_SIZE; z++) {
      for (let x = 0; x < FLOOR_SIZE; x++) {
        if (isReservedCell(x, z)) continue
        const free = !taken.has(`${x},${z}`)
        const t = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 0.9),
          new THREE.MeshBasicMaterial({ color: free ? '#ffffff' : '#ffd166', transparent: true, opacity: free ? 0.2 : 0.12, depthWrite: false }),
        )
        t.rotation.x = -Math.PI / 2
        t.position.set(x + 0.5, 0.035, z + 0.5)
        this.grid.add(t)
      }
    }
  }

  // ---------------------------------------------------------------- visitor entrance

  /** Shows the front of the house instead of the room, with the pet waiting by the door. */
  showExterior(house: House, wall: WallId) {
    this.ext?.group.removeFromParent()
    this.ext = this.kitUsed ? kitExterior(house, wall) : buildExterior(house, wall)
    if (this.kitUsed) kitExteriorGlows(this.ext, this.ctx)
    this.scene.add(this.ext.group)
    for (const l of this.ext.lamps) {
      l.userData.base = l.intensity
      this.ctx.lamps.push(l)
    }
    this.root.visible = false
    this.dynamic.visible = false
    this.mode = 'exterior'
    this.sun.position.set(-5, 10, 10)
    this.sun.target.position.set(0, 0, 0)
    if(this.avatar)this.avatar.group.visible=false
    this.pet.frozen = true
    this.pet.placeXZ(this.ext.petSpot.x, this.ext.petSpot.z, 0.14)
    this.extraAnchors.set('bell', this.ext.bell.clone())
    if (this.ext.mailbox) this.extraAnchors.set('mailbox', this.ext.mailbox.clone())
    this.hotIds = ['bell', 'pet']
    this.buildHotspots()
    this.extDoor = this.extDoorTarget = 0
    this.jump(0.35, 1.3, Math.max(15, this.baseRadius * 1.15), new THREE.Vector3(0, 1.3, -0.5))
  }

  openFrontDoor() {
    this.extDoorTarget = 1
    this.dirty = true
  }

  get doorway(): THREE.Vector3 {
    return this.ext?.doorway.clone() ?? new THREE.Vector3()
  }

  /** Swaps the exterior for the room (call while the screen is faded out). */
  enterHome(hotspots: string[]) {
    if (this.ext) {
      for (const l of this.ext.lamps) this.ctx.lamps.splice(this.ctx.lamps.indexOf(l), 1)
      disposeTree(this.ext.group)
      this.ext.group.removeFromParent()
      this.ext = null
    }
    this.mode = 'home'
    this.root.visible = true
    this.dynamic.visible = true
    this.sun.position.set(8, 9, -8)
    this.sun.target.position.set(3, 0, 3)
    if(this.avatar)this.avatar.group.visible=true
    this.pet.frozen = false
    this.pet.placeAt('door')
    this.pet.set('greet')
    this.extraAnchors.clear()
    this.hotIds = hotspots
    this.buildHotspots()
    this.jump(Math.PI / 4, this.basePol, this.baseRadius * 0.55, new THREE.Vector3(1.2, 1.2, 4))
    this.resetView()
    this.dirty = true
  }

  // ---------------------------------------------------------------- pet and door

  petState(s: PetState) {
    this.pet.set(s)
    this.dirty = true
  }

  setDoorOpen(open: boolean) {
    this.doorTarget = open ? 1 : 0
    this.dirty = true
  }

  // ---------------------------------------------------------------- camera

  inspect=false

  rotateBy(rad: number) {
    this.want.az += rad
    this.dirty = true
  }

  /** Zooms; when zooming in with a screen point (wheel, pinch centre) the view also drifts toward what is under it. */
  zoomBy(f: number, at?: { x: number; y: number }) {
    const before = this.want.radius
    this.want.radius = clamp(before * f, MIN_RADIUS, this.baseRadius * 1.25)
    if (at && f < 1 && this.want.radius < before) {
      const r = this.renderer.domElement.getBoundingClientRect()
      this.raycaster.setFromCamera(new THREE.Vector2(((at.x - r.left) / r.width) * 2 - 1, -((at.y - r.top) / r.height) * 2 + 1), this.camera)
      const hit = this.raycaster.intersectObjects([this.root, this.dynamic, this.pet.group], true).find((h) => h.object.visible && h.distance > 0.3)
      const p = hit?.point ?? this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3()) ?? null
      if (p) {
        const k = Math.min(0.6, (1 - this.want.radius / before) * 1.6)
        this.want.tgt.lerp(p, k).clamp(PAN_MIN, PAN_MAX)
      }
    }
    this.dirty = true
  }

  /** Moves the look-at point across the screen plane by a pixel delta (two-finger drag, right/shift drag). */
  private panBy(dxPx: number, dyPx: number) {
    const h = Math.max(1, this.renderer.domElement.clientHeight)
    const unit = (2 * this.radius * Math.tan((this.camera.fov * Math.PI) / 360)) / h
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0)
    right.y = 0
    right.normalize()
    const forward = new THREE.Vector3(-right.z, 0, right.x)
    const d = right.multiplyScalar(-dxPx * unit).add(forward.multiplyScalar(-dyPx * unit))
    this.want.tgt.add(d).clamp(PAN_MIN, PAN_MAX)
    this.tgt.copy(this.want.tgt)
    this.dirty = true
  }

  /** Flies close to the point under the pointer (double tap / double click): look at details up close. */
  private focusPoint(e: PointerEvent): boolean {
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    // A wall that has faded out to show the room is not something the visitor is pointing at.
    const faded = new Set<THREE.Object3D>()
    for (const w of this.shell?.walls ?? []) if (w.alpha < 0.95) w.group.traverse((o) => faded.add(o))
    const hits = this.raycaster
      .intersectObjects([this.root, this.dynamic, this.pet.group], true)
      .filter((h) => h.object.visible && h.distance > 0.3 && !faded.has(h.object))
    const h = hits[0]
    if (!h) return false
    const dist = this.camera.position.distanceTo(h.point)
    this.want.tgt.copy(h.point).clamp(PAN_MIN, PAN_MAX)
    this.want.radius = clamp(dist * 0.42, 1.5, this.baseRadius)
    this.want.pol = clamp(this.pol, 0.7, 1.2)
    this.dirty = true
    return true
  }

  private returnPose?:{az:number;pol:number;radius:number;tgt:THREE.Vector3}
  rememberView(){this.returnPose??={...this.want,tgt:this.want.tgt.clone()}}
  returnToRoom(){const p=this.returnPose;if(p)this.flyTo(p.az,p.pol,p.radius,p.tgt);this.returnPose=undefined}
  private following=false
  showResident(){this.following=!this.following;if(this.avatar){this.avatar.group.visible=true;this.want.tgt.copy(this.avatar.position);this.want.tgt.y=.65;this.want.radius=3.3;this.dirty=true}}
  capturePhoto(aspect:number){
    this.paint()
    const src=this.renderer.domElement
    const w=Math.min(src.width,src.height*aspect),h=w/aspect
    const c=document.createElement('canvas');c.width=w;c.height=h
    c.getContext('2d')?.drawImage(src,(src.width-w)/2,(src.height-h)/2,w,h,0,0,w,h)
    return c.toDataURL('image/jpeg',.92)
  }
  enterDoorway() {
    // The door is at x=0, z=4.5. Look from just inside it toward the lit desk.
    this.camera.fov=62
    this.camera.updateProjectionMatrix()
    const target=new THREE.Vector3(2.85,1.13,1.0)
    this.jump(-.62,1.43,4.05,target)
  }
  resetView() {
    this.camera.fov=32
    this.camera.updateProjectionMatrix()
    this.want.az = nearestAz(this.az, Math.PI / 4)
    this.want.pol = this.basePol
    this.want.radius = this.baseRadius
    this.want.tgt.copy(TARGET)
    this.dirty = true
  }

  /** Moves the camera close to an object (the sheet that opens covers the lower part). */
  /** Adds a hotspot that has an anchor (used for the mailbox once the guestbook is known to exist). */
  addHotspot(id: string) {
    if (this.hotIds.includes(id) || !this.extraAnchors.has(id)) return
    this.hotIds = [...this.hotIds, id]
    this.buildHotspots()
    this.dirty = true
  }

  focus(id: string) {
    const a = ANCHORS[id]
    let p: THREE.Vector3 | null = this.anchorsKit.get(id)?.clone() ?? (a ? new THREE.Vector3(...a) : null)
    const o = this.objects.get(id)
    if (o) p = o.position.clone()
    if (id === 'pet') p = new THREE.Vector3(this.pet.position.x, 0.6, this.pet.position.z)
    if (!p) return
    // Look slightly below the object so it sits in the upper part of the screen.
    this.want.tgt.copy(p).add(new THREE.Vector3(0, -0.35, 0))
    if(['computer','records','wall','diary','calendar'].includes(id)){
      this.want.az=nearestAz(this.az,.08)
      this.want.tgt.copy(p)
      this.want.radius=this.camera.fov>45?1.85:2.65
    }else this.want.radius = Math.max(2.4, this.baseRadius * 0.3)
    this.want.pol = Math.max(this.basePol, 1.05)
    this.dirty = true
  }

  /** Sets the camera instantly (used by the visitor intro). */
  jump(az: number, pol: number, radius: number, tgt: THREE.Vector3) {
    this.az = this.want.az = az
    this.pol = this.want.pol = pol
    this.radius = this.want.radius = radius
    this.tgt.copy(tgt)
    this.want.tgt.copy(tgt)
    this.dirty = true
  }

  flyTo(az: number, pol: number, radius: number, tgt: THREE.Vector3) {
    this.want.az = az
    this.want.pol = pol
    this.want.radius = radius
    this.want.tgt.copy(tgt)
    this.dirty = true
  }

  get defaultRadius() {
    return this.baseRadius
  }

  // ---------------------------------------------------------------- input

  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture?.(e.pointerId)
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pointers.size === 1) {
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }
      this.moved = 0
      this.panning = e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey)
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y)
      this.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
    this.vAz = 0
  }

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) {
      this.hoverCanvas(e)
      return
    }
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    this.moved += Math.abs(dx) + Math.abs(dy)
    if (this.pointers.size === 1 && this.panning) {
      this.panBy(dx, dy)
    } else if (this.pointers.size === 1) {
      const k = 0.0075
      this.want.az -= dx * k
      this.az -= dx * k
      this.want.pol = clamp(this.want.pol - dy * k, 0.45, 1.35)
      this.pol = this.want.pol
      this.vAz = (-dx * k) / 0.016
      this.dirty = true
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (this.pinch > 0) this.zoomBy(this.pinch / d, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      this.radius = this.want.radius
      this.pinch = d
      // Two fingers moving together pan the view; moving apart/together zooms (both at once is fine).
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      this.panBy(mx - this.mid.x, my - this.mid.y)
      this.mid = { x: mx, y: my }
    }
  }

  private onUp = (e: PointerEvent) => {
    const had = this.pointers.has(e.pointerId)
    this.pointers.delete(e.pointerId)
    if (!had) return
    if (this.pointers.size === 0 && this.moved < 8 && performance.now() - this.downAt.t < 450) {
      const now = performance.now()
      const dbl = now - this.lastTap.t < 360 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 28
      this.lastTap = { t: now, x: e.clientX, y: e.clientY }
      // Double tap on something that is not itself a button (a chair, a plant, a mug) flies in to look at it.
      if (dbl && !this.hitId(e) && this.focusPoint(e)) this.lastTap.t = 0
      else this.tap(e)
    } else if (this.pointers.size === 0) {
      this.want.az += Math.max(-0.5, Math.min(0.5, this.vAz * 0.12))
    }
    if (this.pointers.size < 2) this.pinch = 0
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.zoomBy(Math.exp(e.deltaY * 0.0012), { x: e.clientX, y: e.clientY })
  }

  private lostTimer = 0
  private onLost = (e: Event) => {
    e.preventDefault()
    window.clearTimeout(this.lostTimer)
    this.lostTimer = window.setTimeout(() => {
      if (!this.disposed && this.renderer.getContext().isContextLost()) this.opts.onContextLost?.()
    }, 4000)
  }
  private onRestored = () => {
    window.clearTimeout(this.lostTimer)
    this.dirty = true
    this.opts.onContextRestored?.()
  }

  private onVis = () => {
    if (!document.hidden) {
      this.dirty = true
      // Came back to a dead context that never restored: tell the owner instead of showing a frozen canvas.
      if (this.renderer.getContext().isContextLost()) this.onLost(new Event('webglcontextlost'))
    }
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }

  private hitId(e: PointerEvent): string | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const roots = this.mode === 'exterior' ? [this.pet.group] : [...this.pickRoots.filter((r) => this.pickable(r)), this.pet.group]
    const hits = this.raycaster.intersectObjects(roots, true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o) {
        if (o.userData.pick) return o.userData.pick as string
        o = o.parent
      }
    }
    return null
  }

  private pickable(o: THREE.Object3D): boolean {
    if (o.userData.pick === 'door' || o.userData.pick === 'window') {
      const w = this.shell.walls[o.userData.pick === 'window' ? 0 : 1]
      return !!w && w.alpha > 0.6
    }
    return true
  }

  private hoverCanvas(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return
    const id = this.hitId(e)
    this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
    this.hover(id)
  }

  private tap(e: PointerEvent) {
    if(this.inspect && this.mode==='home'){
      this.raycaster.setFromCamera(this.ndc(e),this.camera)
      const hit=this.raycaster.intersectObjects([...this.pickRoots,this.dynamic,this.pet.group],true)[0]
      if(hit){this.want.tgt.copy(hit.point);this.want.radius=2.2;this.dirty=true}
      return
    }
    const id = this.hitId(e)
    if (id) {
      if (id === 'door') sfx('door')
      else if (id === 'diary' || id === 'calendar') sfx('paper')
      this.opts.onPick(id)
      return
    }
    if (this.mode === 'home' && (this.avatar || this.decorMode)) {
      this.raycaster.setFromCamera(this.ndc(e), this.camera)
      const p = new THREE.Vector3()
      if (this.raycaster.ray.intersectPlane(this.floorPlane, p)) {
        const x = Math.floor(p.x)
        const z = Math.floor(p.z)
        if (x >= 0 && z >= 0 && x < FLOOR_SIZE && z < FLOOR_SIZE) {
          if(this.decorMode) this.opts.onCell?.(x,z)
          else if (!isReservedCell(x,z) && !this.data?.decor.some(d=>d.x===x && d.z===z)) this.walkTo(x,z)
          this.dirty=true
        }
      }
    }
  }

  // ---------------------------------------------------------------- lighting

  setNight(night: boolean, instant = false) {
    this.night = night
    if (instant) this.nightMix = night ? 1 : 0
    this.opts.container.classList.toggle('is-night', night)
    this.opts.container.classList.toggle('is-day', !night)
    this.dirty = true
  }

  recordPlaying=false
  private lampsOn=true
  private daylightColor=''
  roomHour(period:string){
    const h=period==='auto'?new Date().getHours():({morning:7,afternoon:14,dusk:18,midnight:0}[period]??14)
    this.daylightColor=h>=17&&h<21?'#f6a073':h<10?'#ffe1b9':'#fff0d2'
    this.setNight(h<5||h>=20)
    this.sun.position.x=h<10?-3:7;this.dirty=true
  }

  private applyLight() {
    const n = this.nightMix
    const lerp = (a: number, b: number) => a + (b - a) * n
    // A high key light and a low fill is what separates "a room at night" from "a flat diagram of a room".
    this.sun.intensity = lerp(6.6, 1.5)
    this.sun.color.set(n > 0.5 ? '#b9c6ff' : this.daylightColor || '#ffd9a8')
    this.hemi.intensity = lerp(0.24, 0.2)
    this.hemi.color.set(n > 0.5 ? '#2c3a63' : '#cfe2f2')
    this.hemi.groundColor.set(n > 0.5 ? '#1d1826' : '#6b5a45')
    this.ambient.intensity = lerp(0.07, 0.09)
    this.rim.intensity = lerp(0.62, 0.42)
    this.rim.color.set(n > 0.5 ? '#6c86c8' : '#b9d4ee')
    this.renderer.toneMappingExposure = lerp(1.46, 1.46)
    for (const l of this.ctx.lamps) {
      const base = (l.userData.base as number) ?? 1
      const flick = l.userData.flicker ? 1 + Math.sin(performance.now() / 120) * 0.05 : 1
      // Lamps keep a low ember in daylight so the room never loses its warm pools.
      l.intensity = Number(this.lampsOn) * base * (0.3 + 0.7 * n) * 1.7 * flick
      const halo = l.userData.halo as THREE.Sprite | undefined
      if (halo) (halo.material as THREE.SpriteMaterial).opacity = Number(this.lampsOn) * (0.06 + 0.5 * n)
    }
    for (const g of this.ctx.glows) g.mat.emissiveIntensity = lerp(g.day, g.night)
    if (this.dust) (this.dust.material as THREE.PointsMaterial).opacity = lerp(0.11, 0.34)
    this.pipeline?.setBackground(n > 0.5)
    this.renderer.domElement.style.setProperty('--night', String(n))
  }

  private paint() {
    if (this.pipeline) this.pipeline.render()
    else this.renderer.render(this.scene, this.camera)
  }

  private makeDust() {
    const count = 150
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * 6
      pos[i * 3 + 1] = 0.15 + Math.random() * 2.9
      pos[i * 3 + 2] = Math.random() * 6
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({
      size: 0.022,
      map: glowTexture(),
      color: '#ffe4bd',
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    this.dust = new THREE.Points(geo, m)
    this.dust.frustumCulled = false
    this.scene.add(this.dust)
  }

  // ---------------------------------------------------------------- loop

  private resize() {
    const c = this.opts.container
    const w = Math.max(1, c.clientWidth)
    const h = Math.max(1, c.clientHeight)
    this.renderer.setSize(w, h, false)
    this.pipeline?.setSize(w, h, this.renderer.getPixelRatio())
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    // Portrait screens stand farther back (and look more from above) to fit the whole room.
    const asp = w / h
    const old = this.baseRadius
    this.baseRadius = Math.max(12.5, 4.6 / (Math.tan((this.camera.fov * Math.PI) / 360) * asp))
    const oldPol = this.basePol
    this.basePol = asp < 0.8 ? 0.86 : 1.0
    if (Math.abs(this.want.radius - old) < 0.01) this.want.radius = this.baseRadius
    if (Math.abs(this.radius - old) < 0.01) this.radius = this.baseRadius
    if (Math.abs(this.want.pol - oldPol) < 0.01) this.want.pol = this.basePol
    if (Math.abs(this.pol - oldPol) < 0.01) this.pol = this.basePol
    this.camera.updateProjectionMatrix()
    this.dirty = true
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    if (document.hidden || !this.visible) return
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.elapsed += dt
    const t = this.elapsed
    this.stringLights?.update(now,!!this.opts.reduceMotion)
    const animated = !this.opts.reduceMotion

    if(this.following && this.avatar && !this.returnPose && !this.decorMode){this.want.tgt.copy(this.avatar.position);this.want.tgt.y=.62}
    // Camera easing.
    const k = 1 - Math.exp(-dt * 7)
    const before = [this.az, this.pol, this.radius, this.tgt.x, this.tgt.y, this.tgt.z]
    this.az += (this.want.az - this.az) * k
    this.pol += (this.want.pol - this.pol) * k
    this.radius += (this.want.radius - this.radius) * k
    this.tgt.lerp(this.want.tgt, k)
    const camChanged = before.some((v, i) => Math.abs(v - [this.az, this.pol, this.radius, this.tgt.x, this.tgt.y, this.tgt.z][i]!) > 1e-5)
    const sp = Math.sin(this.pol)
    // A room you are standing in never holds perfectly still. Two slow sines (one for the drift, one
    // for the breath) are enough to stop the shot from reading as a screenshot.
    const nowMs = performance.now()
    const drift = Math.sin(nowMs * 0.00021) * 0.0135 + Math.sin(t * 0.00057) * 0.004
    const breath = Math.sin(nowMs * 0.00034) * 0.006
    const az = this.az + drift
    this.camera.position.set(this.tgt.x + this.radius * sp * Math.sin(az), this.tgt.y + this.radius * Math.cos(this.pol) + breath, this.tgt.z + this.radius * sp * Math.cos(az))
    const ceiling=this.shell?.group.getObjectByName('interior-ceiling')
    if(ceiling){
      // A cutaway room has no ceiling: keeping it only for the inside-the-room camera stops it from
      // swallowing the top third of the frame.
      ceiling.visible=this.mode==='home'&&this.radius<3.4
    }
    this.camera.lookAt(this.tgt)
    this.pipeline?.setFocus(this.radius)

    // Walls between the camera and the room fade out.
    let fading = false
    for (const w of this.shell?.walls ?? []) {
      const dot = this.camera.position.clone().sub(w.point).dot(w.inward)
      const target = dot > 0.2 ? 1 : 0
      const next = w.alpha + (target - w.alpha) * Math.min(1, dt * 10)
      if (Math.abs(next - w.alpha) > 0.002) {
        fading = true
        w.alpha = Math.abs(next - target) < 0.01 ? target : next
        for (const m of w.mats) {
          m.opacity = w.alpha
          m.depthWrite = w.alpha > 0.95
          m.visible = w.alpha > 0.01
        }
      }
    }

    // Night easing.
    const goal = this.night ? 1 : 0
    let lightChanged = false
    if (Math.abs(this.nightMix - goal) > 0.001) {
      this.nightMix += (goal - this.nightMix) * Math.min(1, dt * 3)
      lightChanged = true
    }
    if (lightChanged || this.dirty) this.applyLight()

    // Door.
    if (Math.abs(this.doorOpen - this.doorTarget) > 0.001) {
      this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 4)
      this.shell?.doorPivot.rotation.set(0, -this.doorOpen * 1.7, 0)
      this.dirty = true
    }

    if (this.ext && Math.abs(this.extDoor - this.extDoorTarget) > 0.001) {
      this.extDoor += (this.extDoorTarget - this.extDoor) * Math.min(1, dt * 3.5)
      this.ext.doorPivot.rotation.y = this.extDoor * 1.6
      this.dirty = true
    }

    if(this.avatar&&!this.avatar.moving&&this.route.length){const next=this.route.shift()!;this.avatar.goTo(next.x+.5,next.z+.5);this.dirty=true}
    if (animated) {
      if (this.dust) this.dust.rotation.y = t * 0.018
      if(this.recordPlaying){const disc=this.root.getObjectByName('record');if(disc)disc.rotation.y+=dt*3.49}
      this.avatar?.update(dt,t)
      this.pet.update(dt, t)
      if (this.led && this.data?.welcome) this.led.emissiveIntensity = 0.7 + (Math.sin(t * 3) + 1) * 0.5
      if (this.ring.visible) this.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.05)
      for (const l of this.ctx.lamps) l.userData.flicker = l.distance < 2
    } else if (this.dirty) {
      this.avatar?.update(0.016,t)
      this.pet.update(0.016, t)
    }

    {
      const near = clamp((4.6 - this.radius) / 3.2, 0, 1)
      this.fill.intensity = near * near * (this.nightMix > 0.5 ? 9 : 13)
      this.fill.position.copy(this.camera.position)
    }
    if (animated || this.dirty || camChanged || fading || lightChanged) {
      // The sun and furniture stay put. Reuse the depth map between pet animation samples.
      if (this.dirty || fading || lightChanged || (animated && now - this.lastShadowUpdate >= 125)) {
        this.renderer.shadowMap.needsUpdate = true
        this.lastShadowUpdate = now
      }
      this.paint()
      this.updateHotspots()
      this.dirty = false
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.io.disconnect()
    document.removeEventListener('visibilitychange', this.onVis)
    for (const h of this.hots) h.el.remove()
    window.clearTimeout(this.lostTimer)
    const el = this.renderer.domElement
    el.removeEventListener('webglcontextlost', this.onLost)
    el.removeEventListener('webglcontextrestored', this.onRestored)
    disposeTree(this.scene)
    this.pipeline?.dispose()
    this.renderer.dispose()
    // Release the GPU context now instead of waiting for garbage collection (contexts are a scarce resource).
    this.renderer.forceContextLoss()
    el.remove()
  }

  /** For tests: the current camera azimuth in radians. */
  get azimuth() {
    return this.az
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

/** The equivalent of `target` (mod 2π) that is closest to `current`, so reset turns the short way. */
function nearestAz(current: number, target: number) {
  const tau = Math.PI * 2
  return target + Math.round((current - target) / tau) * tau
}

export function disposeTree(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const geometries = new Set<THREE.BufferGeometry>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry && !o.userData.kit) geometries.add(m.geometry)
    const local = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []
    for (const mat of local) {
      if (o.userData.kit && !mat.userData.roomOwned) continue
      materials.add(mat)
      for (const value of Object.values(mat)) {
        const tex = value as THREE.Texture | null
        if (tex?.isTexture && (!o.userData.kit || tex.userData.roomOwned)) textures.add(tex)
      }
    }
  })
  textures.forEach(t => t.dispose())
  materials.forEach(m => m.dispose())
  geometries.forEach(g => g.dispose())
}

let probed: boolean | undefined

/**
 * Whether this browser can create a WebGL context. The answer is cached and the probe context is released:
 * every `getContext` call makes a real GPU context, browsers keep only about 16, and when they run out they
 * silently kill the OLDEST one, which is the room. (Found by reproduction: scripts/stability.mjs.)
 */
export function webglAvailable(): boolean {
  if (probed !== undefined) return probed
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null
    probed = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    probed = false
  }
  return probed
}
