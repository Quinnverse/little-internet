import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
const q = new URLSearchParams(location.search)
const r = new THREE.WebGLRenderer({ antialias: true })
r.setSize(innerWidth, innerHeight)
document.body.append(r.domElement)
const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight('#fff', '#a88', 1.2))
const d = new THREE.DirectionalLight('#fff', 2.2)
d.position.set(3, 5, 4)
scene.add(d)
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 50)
cam.position.set(2.2, 1.6, 2.8)
new GLTFLoader().load(`/assets/models/${q.get('m')}.glb`, (g) => {
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: q.get('c') ?? '#c9a36d', roughness: 0.7 })
  })
  const b = new THREE.Box3().setFromObject(g.scene)
  const s = 1.4 / b.getSize(new THREE.Vector3()).y
  g.scene.scale.setScalar(s)
  const b2 = new THREE.Box3().setFromObject(g.scene)
  g.scene.position.set(-b2.getCenter(new THREE.Vector3()).x, -b2.min.y, -b2.getCenter(new THREE.Vector3()).z)
  scene.add(g.scene)
  cam.lookAt(0, 0.6, 0)
  r.render(scene, cam)
  ;(window as any).ready = true
})
