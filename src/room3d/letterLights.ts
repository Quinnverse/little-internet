import * as THREE from 'three'

/** On the big wall, each letter hangs from a little porcelain socket on a sagging wire. */
export class LetterLights {
  readonly group = new THREE.Group()
  private lamps: THREE.MeshStandardMaterial[] = []
  private last = -1
  private started = -Infinity
  private enabled = true

  constructor(text:string) {
    const glyphs=Array.from(text.trim()).slice(0,48)
    const rows=Math.max(1,Math.ceil(glyphs.length/12))
    const cols=Math.ceil(glyphs.length/rows)
    const span=2.45, step=Math.min(.23,span/Math.max(cols-1,1))
    const wire=new THREE.MeshStandardMaterial({color:'#514637',roughness:.74})
    const bulb=new THREE.SphereGeometry(.032,12,10)
    const socket=new THREE.CylinderGeometry(.018,.016,.036,10)
    const canvas=document.createElement('canvas')
    canvas.width=1024;canvas.height=rows*100
    const g=canvas.getContext('2d')!
    g.font='italic 52px Georgia, serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#594325'
    for(let row=0;row<rows;row++){
      const chars=glyphs.slice(row*cols,(row+1)*cols)
      const width=Math.max(.24,(chars.length-1)*step)
      const points:THREE.Vector3[]=[]
      for(let i=0;i<=32;i++){const t=i/32;points.push(new THREE.Vector3((t-.5)*(width+.2),-row*.24-.064*Math.sin(Math.PI*t),0))}
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.006,5,false),wire))
      chars.forEach((ch,i)=>{
        const x=(i-(chars.length-1)/2)*step
        const sag=.064*Math.cos(Math.PI*x/(width+.2))
        const y= -row*.24-sag
        const mat=new THREE.MeshStandardMaterial({color:['#cfad72','#ac8b88','#8eafa4'][i%3],emissive:'#ffb973',roughness:.28})
        this.lamps.push(mat)
        const light=new THREE.Mesh(bulb,mat);light.position.set(x,y-.04,.024);light.scale.y=1.25
        const stem=new THREE.Mesh(socket,wire);stem.position.set(x,y-.014,.022)
        this.group.add(light,stem)
        g.fillText(ch,(.5+x/(span+.32))*canvas.width,row*100+53+sag*100/.24)
      })
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace
    const letters=new THREE.Mesh(new THREE.PlaneGeometry(span+.32,rows*.24),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}))
    letters.position.set(0,-rows*.12,.016)
    this.group.add(letters)
    this.group.userData.pick='light-sign'
  }

  play(now:number){this.started=now;this.last=-1}
  lights(on:boolean){if(this.enabled!==on){this.enabled=on;this.last=-1}}
  update(now:number,reduced:boolean){
    const lit=this.enabled?(reduced?this.lamps.length:Math.min(this.lamps.length,Math.floor((now-this.started)/105))):0
    if(lit===this.last)return
    this.last=lit
    this.lamps.forEach((m,i)=>m.emissiveIntensity=i<lit?.95:.03)
  }
}
