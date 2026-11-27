import type { Hand } from './types.ts'

/**
 * MediaPipe HandLandmarker, loaded only when the owner turns the camera on. The model and WebAssembly files are served
 * from this site (public/vision), so no third party sees the video or even learns that it is used.
 */
export type HandTracker = {
  detect: (source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, timestampMs: number) => Hand[]
  /** 'GPU' or 'CPU': whichever MediaPipe could start. */
  delegate: 'GPU' | 'CPU'
  close: () => void
}

const url = (p: string) => new URL(p, document.baseURI).href

export async function createHandTracker(mode: 'VIDEO' | 'IMAGE' = 'VIDEO', preferCPU = false): Promise<HandTracker> {
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(url('vision/wasm'))
  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: url('vision/hand_landmarker.task'), delegate },
      runningMode: mode,
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  let delegate: 'GPU' | 'CPU' = preferCPU ? 'CPU' : 'GPU'
  let lm: Awaited<ReturnType<typeof make>>
  try {
    lm = await make(delegate)
  } catch (error) {
    if (preferCPU) throw error
    delegate = 'CPU'
    lm = await make('CPU')
  }
  let lastTs = -1
  return {
    delegate,
    detect(source, ts) {
      const r = mode === 'VIDEO' ? lm.detectForVideo(source as HTMLVideoElement, (lastTs = Math.max(lastTs + 1, Math.round(ts)))) : lm.detect(source as HTMLImageElement)
      return r.landmarks.map((pts, i) => ({
        points: pts.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        score: r.handedness[i]?.[0]?.score ?? 0,
        handedness: (r.handedness[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right') as 'Left' | 'Right',
      }))
    },
    close: () => lm.close(),
  }
}
