// Drawn once per light change. No external textures or model fetches.
export function windowLandscape(width:number,height:number,period:string){
  const canvas=document.createElement('canvas')
  canvas.width=width;canvas.height=height
  const g=canvas.getContext('2d')!
  const night=period==='midnight', dusk=period==='dusk'
  const sky=g.createLinearGradient(0,0,0,height)
  sky.addColorStop(0,night?'#121732':dusk?'#716694':period==='morning'?'#adbec5':'#77a6ba')
  sky.addColorStop(.62,night?'#34385c':dusk?'#d49b99':'#eed6ac')
  sky.addColorStop(1,night?'#504459':dusk?'#edbe8e':'#f9e0b8')
  g.fillStyle=sky;g.fillRect(0,0,width,height)
  let seed=9725
  const random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296)
  if(night){
    for(let i=0;i<1600;i++){
      const x=random()*width, ribbon=i%3===0
      const y=(ribbon?.34+.18*Math.sin(x/width*4)+(random()+random()+random()-1.5)*.18:random()*.78)*height
      const size=random()*1.4+.38
      g.fillStyle='rgba(239,231,218,'+(.13+random()*.72)+')'
      g.fillRect(x,y,size,size)
    }
  }
  for(let layer=0;layer<3;layer++){
    g.beginPath();g.moveTo(0,height)
    for(let i=0;i<=75;i++){
      const t=i/75, y=.72+layer*.071+.04*Math.sin(t*11+layer)+.037*Math.cos(t*17-layer)+random()*.021
      g.lineTo(t*width,y*height)
    }
    g.lineTo(width,height);g.closePath()
    g.fillStyle=(night?['#34324b','#24283b','#171d2a']:dusk?['#ac8090','#856d7a','#655d68']:['#aeb4a0','#899d90','#667e77'])[layer]!
    g.fill()
  }
  for(let i=0;i<18;i++){
    const x=i*width/17, y=height*(.91+random()*.045),w=width*(.02+random()*.03)
    g.fillStyle=night?'#1d2533':'#65736e';g.fillRect(x,y,w,height-y)
    g.beginPath();g.moveTo(x-2,y);g.lineTo(x+w*.48,y-w*.4);g.lineTo(x+w+2,y);g.fill()
    if(night||dusk){g.fillStyle='#e5bc80';g.fillRect(x+w*.25,y+4,2,3)}
  }
  return canvas
}
