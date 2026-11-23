import type { ImageMime } from '../core/schema.ts'

const MAX_EDGE = 1600
const GIF_KEEP_LIMIT = 2 * 1024 * 1024

export type ProcessedImage = { mime: ImageMime; data: Uint8Array }

/** Resizes a picked photo on the device and re-encodes it as JPEG (Requirement 4.3). */
export async function processPhoto(file: File): Promise<ProcessedImage> {
  if (file.type === 'image/gif' && file.size <= GIF_KEEP_LIMIT) {
    return { mime: 'image/gif', data: new Uint8Array(await file.arrayBuffer()) }
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('This file could not be read as an image.')
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image processing is not available in this browser.')
  ctx.fillStyle = '#ffffff' // JPEG has no transparency
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Could not encode the image.')
  return { mime: 'image/jpeg', data: new Uint8Array(await blob.arrayBuffer()) }
}
