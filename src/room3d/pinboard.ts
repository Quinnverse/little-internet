import * as THREE from 'three'
import type {WallPin} from '../core/schema.ts'
export type PinView=WallPin & {url?:string}
/** Rasterise private pins in stacking order. Only local editor data reaches this texture. */
export async function boardTexture(pins:PinView[]){
 const c=document.createElement('canvas');c.width=768;c.height=432
 const g=c.getContext('2d')!
 g.fillStyle='#986e50';g.fillRect(0,0,c.width,c.height)
 const images=await Promise.all(pins.map(async p=>{
   if(!p.url)return null
   const im=new Image();im.src=p.url;try{await im.decode();return im}catch{return null}
 }))
 pins.forEach((p,i)=>{const w=p.size*c.width/100,h=w*.76
   g.save();g.translate(p.x*c.width/100,p.y*c.height/100);g.rotate(p.rotation*Math.PI/180)
   g.fillStyle='#fff2d2';g.fillRect(-w/2,-h/2,w,h)
   if(images[i])g.drawImage(images[i]!,-w*.46,-h*.45,w*.92,h*.7)
   g.fillStyle='#463c34';g.font='17px serif';g.fillText((p.moment?'✉ ':'')+p.text,-w*.44,images[i]?h*.42:0,w*.88)
   g.fillStyle=p.mount==='tape'?'rgba(219,194,132,.85)':'#9f513a'
   if(p.mount==='tape')g.fillRect(-w*.17,-h*.56,w*.34,h*.14)
   else{g.beginPath();g.arc(0,-h*.44,3,0,2*Math.PI);g.fill()}
   g.restore()
 })
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture
}
