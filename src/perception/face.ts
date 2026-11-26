/** Local motion cues only. No face embeddings, persistence or emotion inference. */
export type FaceCue = 'smile' | 'blink' | 'left' | 'right'
export type FaceTracker = { readonly present:boolean; detect(video:HTMLVideoElement,time:number):FaceCue|null; close():void }
export async function createFaceTracker():Promise<FaceTracker>{
 const {FaceLandmarker,FilesetResolver}=await import('@mediapipe/tasks-vision')
 const files=await FilesetResolver.forVisionTasks(new URL('vision/wasm',document.baseURI).href)
 const model=await FaceLandmarker.createFromOptions(files,{
  baseOptions:{modelAssetPath:new URL('vision/face_landmarker.task',document.baseURI).href,delegate:'CPU'},
  runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.75,minFacePresenceConfidence:.75,minTrackingConfidence:.7,
  outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true,
 })
 let candidate:FaceCue|null=null,since=0,latched:FaceCue|null=null,last=0
 let present=false
 return {get present(){return present},close:()=>model.close(),detect(video,time){
  const result=model.detectForVideo(video,time)
  present=result.faceLandmarks.length>0
  const scores=new Map(result.faceBlendshapes[0]?.categories.map(v=>[v.categoryName,v.score]))
  const pair=(side:string)=>Math.min(scores.get(side+'Left')??0,scores.get(side+'Right')??0)
  const m=result.facialTransformationMatrixes[0]?.data
  const yaw=m?Math.atan2(m[8]!,m[10]!):0
  const cue=pair('eyeBlink')>.65?'blink':pair('mouthSmile')>.72?'smile':yaw>.38?'left':yaw<-.38?'right':null
  if(cue!==candidate){candidate=cue;since=time}
  if(!cue){latched=null;return null}
  if(cue===latched||time-last<650||time-since<(cue==='blink'?0:150))return null
  latched=cue;last=time;return cue
 }}
}
