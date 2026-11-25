import { MAX_PHOTO_CHARS, MAX_VOICE_CHARS, letterToSvg, type Letter } from '../core/letter.ts'

/** Renders a letter to a PNG on this device. Rejects when the browser cannot draw it (never returns a blank image). */
export async function letterToPng(letter: Letter, width = 700): Promise<Uint8Array> {
  const svg = letterToSvg(letter, { width })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok()
      img.onerror = () => bad(new Error('This letter could not be drawn on this device.'))
      img.src = url
    })
    const h = Math.round((width * 1300) / 1000)
    const c = document.createElement('canvas')
    c.width = width
    c.height = h
    const g = c.getContext('2d')
    if (!g) throw new Error('Image processing is not available in this browser.')
    g.drawImage(img, 0, 0, width, h)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
    if (!blob) throw new Error('Could not encode the letter as an image.')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Shrinks a picked photo until its data URL fits the letter limit, trying smaller sizes and lower quality. */
export async function photoForLetter(file: File): Promise<string> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('This file could not be read as an image.')
  }
  try {
    for (const edge of [720, 560, 440, 340]) {
      const k = Math.min(1, edge / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(bmp.width * k))
      c.height = Math.max(1, Math.round(bmp.height * k))
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(bmp, 0, 0, c.width, c.height)
      for (const q of [0.8, 0.65, 0.5]) {
        const url = c.toDataURL('image/jpeg', q)
        if (url.length <= MAX_PHOTO_CHARS) return url
      }
    }
  } finally {
    bmp.close()
  }
  throw new Error('This photo is too detailed to fit in a letter. Try another one.')
}

export function voiceToDataUrl(mime: string, data: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000))
  const url = `data:${mime};base64,${btoa(bin)}`
  if (url.length > MAX_VOICE_CHARS) throw new Error('That recording is too long for a letter. Keep it under about 20 seconds.')
  return url
}
