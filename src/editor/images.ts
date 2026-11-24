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

const isGif = (b: Uint8Array) => b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61

export type DecorationUse = 'image' | 'sticker' | 'background' | 'favicon'

/**
 * Prepares an image the owner uploads FOR the website. Every file is decoded first (so only real
 * images get in). GIFs up to 2 MB keep their animation; everything else is re-encoded on the
 * device: PNG keeps transparency for stickers and favicons, photos become JPEG.
 */
export async function processDecoration(file: File, use: DecorationUse): Promise<ProcessedImage> {
  if (file.size > 20 * 1024 * 1024) throw new Error('This image is larger than 20 MB.')
  const raw = new Uint8Array(await file.arrayBuffer())
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([raw as BlobPart], { type: file.type || 'application/octet-stream' }))
  } catch {
    throw new Error('This file could not be read as an image.')
  }
  if (isGif(raw) && raw.byteLength <= GIF_KEEP_LIMIT && use !== 'favicon') {
    bitmap.close()
    return { mime: 'image/gif', data: raw }
  }
  const edge = use === 'favicon' ? 64 : use === 'sticker' ? 600 : MAX_EDGE
  const scale = use === 'favicon' ? edge / Math.max(bitmap.width, bitmap.height) : Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image processing is not available in this browser.')
  const png = use === 'sticker' || use === 'favicon' || file.type === 'image/png' || file.type === 'image/gif'
  if (!png) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.imageSmoothingEnabled = !(use === 'sticker' && scale >= 1)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const mime = png ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mime, 0.86))
  if (!blob) throw new Error('Could not encode the image.')
  return { mime, data: new Uint8Array(await blob.arrayBuffer()) }
}

/** Opens the file picker for one image. Resolves null when the owner cancels. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}
