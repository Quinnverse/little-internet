import {createHash} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

const wasmDir='node_modules/@mediapipe/tasks-vision/wasm'
const digest=createHash('sha256')
for(const file of [...readdirSync(wasmDir).map(name=>wasmDir+'/'+name),'public/vision/hand_landmarker.task','public/vision/face_landmarker.task'].sort())digest.update(readFileSync(file))
export default defineConfig({
  define:{__VISION_RELEASE__:JSON.stringify(digest.digest('hex').slice(0,16))},
  // Relative base so the editor works from any path on any static host.
  base: './',
  plugins: [preact()],
})
