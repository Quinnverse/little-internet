import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MODELS_B64 } from './models.generated.ts'

/**
 * The 3D kit: models made in Blender (assets/blender), quantized and embedded as base64 so the app and
 * the exported room.js need no network fetch. `getModel` returns a fresh clone; materials are shared with
 * the cache, so a caller that recolours something must clone that material first.
 */
type Entry = { scene: THREE.Group; animations: THREE.AnimationClip[] }

const cache = new Map<string, Entry>()
let loading: Promise<void> | null = null

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/** Parses every embedded model once. Safe to call repeatedly. */
export function preloadModels(): Promise<void> {
  if (loading) return loading
  const loader = new GLTFLoader()
  const jobs = Object.entries(MODELS_B64).map(
    ([name, b64]) =>
      new Promise<void>((resolve) => {
        try {
          loader.parse(
            b64ToBuffer(b64),
            '',
            (gltf) => {
              gltf.scene.traverse((o) => {
                const m = o as THREE.Mesh
                if (m.isMesh) {
                  m.castShadow = true
                  m.receiveShadow = true
                }
              })
              cache.set(name, { scene: gltf.scene, animations: gltf.animations })
              resolve()
            },
            () => resolve(),
          )
        } catch {
          resolve()
        }
      }),
  )
  loading = Promise.all(jobs).then(() => undefined)
  return loading
}

export function hasModel(name: string): boolean {
  return cache.has(name)
}

/** A fresh copy of a model (geometry and materials are shared), or null if it is not loaded. */
export function getModel(name: string): THREE.Group | null {
  const e = cache.get(name)
  if (!e) return null
  const g = e.scene.clone(true) as THREE.Group
  g.traverse((o) => (o.userData.kit = true))
  return g
}

export function getAnimations(name: string): THREE.AnimationClip[] {
  return cache.get(name)?.animations ?? []
}

/** Names of the models the room needs; the app falls back to its code-drawn objects if any is missing. */
export const KIT_REQUIRED = [
  'cabin_room_shell', 'villa_room_shell', 'cabin_exterior', 'villa_exterior',
  'desk', 'office_chair', 'bookshelf', 'dresser', 'side_table', 'pet_bed', 'rug',
  'computer', 'keyboard_mouse', 'diary', 'desk_lamp', 'pen_cup', 'mug', 'answering_machine', 'rotary_phone',
  'record_player', 'lava_lamp', 'cd_disc', 'photo_wall', 'wall_clock', 'calendar', 'stickers',
  'plant', 'cactus', 'floor_lamp', 'armchair', 'stool', 'basket', 'mini_bookcase',
  'keepsake_shell', 'keepsake_candle', 'keepsake_book', 'keepsake_flower_vase', 'keepsake_cassette',
  'keepsake_postcard', 'keepsake_photo_frame', 'keepsake_ticket',
  'pet_ghost',
] as const

export function kitReady(): boolean {
  return KIT_REQUIRED.every((n) => cache.has(n))
}
