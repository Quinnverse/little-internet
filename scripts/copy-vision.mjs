// Copies the MediaPipe WebAssembly files next to the app so hand tracking runs from this site only
// (no CDN, no third-party request). The model file itself is committed in public/vision/.
import { cpSync, mkdirSync } from 'node:fs'
const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/vision/wasm'
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log(`copied ${from} -> ${to}`)
