import * as THREE from 'three'

import timberImage from './textures/wood-table.jpg?inline'

let grainMap: THREE.Texture | undefined
function woodTexture(){
  if(!grainMap){
    grainMap=new THREE.TextureLoader().load(timberImage)
    grainMap.wrapS=grainMap.wrapT=THREE.RepeatWrapping
    grainMap.anisotropy=4
  }
  return grainMap
}

const timber = new Set(['c7d5233','cd09a62','cb57d4a','ca1693b','c8c5830'])
const linen = new Set(['c6f9a82','cc9786b','cf0d9bd','ce3a88f'])

/** The packed Blender meshes use palette materials. World-scale grain survives quantized UVs. */
export function finishSurface(mat: THREE.MeshStandardMaterial) {
  const wood = timber.has(mat.name)
  if (!wood && !linen.has(mat.name)) return
  mat.roughness = wood ? .58 : .91
  mat.customProgramCacheKey = () => wood ? 'home-walnut-v1' : 'home-linen-v1'
  mat.onBeforeCompile = shader => {
    if(wood)shader.uniforms.grainMap={value:woodTexture()}
    shader.vertexShader = 'varying vec3 vFinishPosition;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvFinishPosition=(modelMatrix*vec4(transformed,1.)).xyz;')
    const grain = wood ? `
      vec3 p=vFinishPosition;
      float growth=p.y*70.+p.z*23.+1.6*sin(p.x*2.3+p.z*3.)+.43*sin(p.x*6.1+p.y*4.);
      float pores=(.5+.5*sin(growth*5.8))*clamp(1.-fwidth(growth)*1.5,0.,1.);
      float vein=pow(.5+.5*sin(growth),4.);
      vec3 n=abs(normalize(cross(dFdx(p),dFdy(p))));
      vec2 uv=n.y>max(n.x,n.z)?p.xz:(n.x>n.z?p.zy:p.xy);
      float grain=dot(texture2D(grainMap,uv*vec2(.7,1.4)).rgb,vec3(.299,.587,.114));
      diffuseColor.rgb*=.70+.85*grain-.045*vein-.025*pores;
    ` : `
      vec3 p=vFinishPosition*560.;
      float weave=sin(p.x+p.z)*sin(p.y+p.z);
      diffuseColor.rgb*=.98+.09*weave*clamp(1.-length(fwidth(p))*.15,0.,1.);
    `
    shader.fragmentShader = (wood?'uniform sampler2D grainMap;\n':'')+'varying vec3 vFinishPosition;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+grain)
  }
}

/** Soft folded fabric pinched at the rail. Each side has its own hem. */
export function windowDrapes() {
  const group=new THREE.Group()
  const cloth=new THREE.MeshStandardMaterial({color:'#d8bba4',roughness:.94,side:THREE.DoubleSide,transparent:true})
  for(const side of [-1,1]){
    const g=new THREE.PlaneGeometry(1,1,36,12),p=g.attributes.position!
    for(let i=0;i<p.count;i++){
      const u=p.getX(i)+.5,v=.5-p.getY(i)
      const width=.23+.15*v-.085*Math.sin(v*Math.PI)
      const wave=Math.sin(u*Math.PI*8+side*.4*v)
      p.setXYZ(i,3.2+side*(.64-width*u),2.46-v*(1.54+.024*wave),.065+.045*wave+.025*v*v)
    }
    g.computeVertexNormals()
    const mesh=new THREE.Mesh(g,cloth)
    mesh.castShadow=true
    group.add(mesh)
  }
  return {group,cloth}
}
