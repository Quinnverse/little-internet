import * as THREE from 'three'

/** Render our patisserie still once. A wish never owns a second running 3D loop. */
export function drawWishCake(target: HTMLCanvasElement): void {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1.68, 1.68, 2.14, -0.38, 0.1, 20)
  camera.position.set(2.1, 1.9, 6)
  camera.lookAt(0, 0.15, 0)
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  function mesh(shape: THREE.BufferGeometry, color: string, x=0, y=0, z=0) {
    let material = materials.get(color)
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: .62 })
      materials.set(color, material)
    }
    geometries.add(shape)
    const object = new THREE.Mesh(shape, material)
    object.position.set(x,y,z)
    scene.add(object)
    return object
  }
  function turned(profile: number[][], color: string) {
    return mesh(new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x,y)),64),color)
  }
  try {
    renderer.setSize(560,420,false)
    renderer.setClearColor(0,0)
    scene.add(new THREE.HemisphereLight(0xfff4dc,0xb6a6bd,2.2))
    const light=new THREE.DirectionalLight(0xffe5b2,3)
    light.position.set(-2,4,3)
    scene.add(light)
    turned([[.01,.01],[.34,.01],[.42,.035],[.43,.065],[.34,.09],[.15,.12],[.12,.24],[.24,.29],[1.08,.34],[1.14,.39],[1.13,.415],[.01,.40]],'#c1d5cc')
    turned([[.01,.4],[.8,.4],[.86,.44],[.88,.49],[.88,.91],[.85,.97],[.80,1],[.01,1]],'#cf8a82')
    turned([[.01,.98],[.58,.98],[.61,1.02],[.61,1.33],[.58,1.38],[.01,1.39]],'#ffdfab')
    const bead=new THREE.SphereGeometry(.085,12,10)
    for(const [radius,y,count] of [[.84,.94,40],[.60,1.36,29],[.84,.46,40]] as const) {
      for(let i=0;i<count;i++){
        const angle=i*2*Math.PI/count
        const rosette=mesh(bead,'#fff1cc',radius*Math.cos(angle),y,radius*Math.sin(angle))
        rosette.scale.set(1,.82,.78)
        rosette.rotation.y=-angle
      }
    }
    const sprinkle=new THREE.CapsuleGeometry(.013,.06,3,5)
    for(let i=0;i<51;i++){
      const a=i*2.4
      const bit=mesh(sprinkle,['#f5da94','#90b8b1','#f5b4aa'][i%3]!, .882*Math.cos(a),.55+((i*17)%31)/100,.882*Math.sin(a))
      bit.rotation.z=Math.sin(i)*.9
    }
    const shape=new THREE.Shape()
    for(let i=0;i<10;i++){
      const angle=Math.PI/2+i*Math.PI/5, radius=i%2?.085:.17
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius
      if(i===0)shape.moveTo(x,y)
      else shape.lineTo(x,y)
    }
    shape.closePath()
    const star=new THREE.ExtrudeGeometry(shape,{depth:.05,bevelEnabled:true,bevelSegments:2,bevelSize:.014,bevelThickness:.012})
    for(const [x,y,z] of [[-.33,1.65,.07],[.03,1.83,-.15],[.32,1.68,.05]] as const){
      mesh(new THREE.CylinderGeometry(.014,.014,y-1.38,10),'#bf9660',x,(y+1.38)/2,z)
      mesh(star,'#f9c559',x,y,z)
      const fire=mesh(bead,'#ffeb99',x,y+.23,z)
      fire.scale.set(.53,1.15,.53)
      fire.material.emissive.set('#ffb556')
    }
    renderer.render(scene,camera)
    target.width=560
    target.height=420
    target.getContext('2d')?.drawImage(renderer.domElement,0,0)
  } finally {
    geometries.forEach(g=>g.dispose())
    materials.forEach(m=>m.dispose())
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
