// Validates an audio file chosen instead of recording (voice spec, Requirement 3.2).
import { AUDIO_MIMES, MAX_RECORDING_BYTES, MAX_RECORDING_MS, type AudioMime } from '../core/schema.ts'
import type { Recorded } from './recorder.ts'

const ALIASES: Record<string, AudioMime> = {
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/aac': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/opus': 'audio/ogg',
  // Browsers label files by extension: .webm/.mp4/.ogg come through as video/* even when
  // they hold only audio. Playback is still checked by `measure` below.
  'video/webm': 'audio/webm',
  'video/mp4': 'audio/mp4',
  'video/ogg': 'audio/ogg',
}
const BY_EXT: Record<string, AudioMime> = { webm: 'audio/webm', m4a: 'audio/mp4', mp4: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg' }

export function audioMimeFor(type: string, fileName: string): AudioMime | null {
  const t = type.split(';')[0]!.trim().toLowerCase()
  if ((AUDIO_MIMES as readonly string[]).includes(t)) return t as AudioMime
  if (ALIASES[t]) return ALIASES[t]!
  if (!t || t === 'application/octet-stream') return BY_EXT[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? null
  return null
}

function measure(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    const done = (v: number | Error) => {
      window.clearTimeout(timeout)
      audio.removeAttribute('src')
      if (v instanceof Error) reject(v)
      else resolve(v)
    }
    const timeout = window.setTimeout(() => done(new Error('Could not read how long this audio is.')), 8000)
    audio.addEventListener('error', () => done(new Error('This audio file could not be played in this browser.')))
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) return done(audio.duration)
      // Some WebM files report Infinity until the end is reached.
      audio.addEventListener('durationchange', () => Number.isFinite(audio.duration) && done(audio.duration))
      audio.currentTime = 1e9
    })
    audio.src = url
  })
}

export async function readAudioFile(file: File): Promise<Recorded> {
  const mime = audioMimeFor(file.type, file.name)
  if (!mime) throw new Error('Choose a WebM, M4A/MP4, Ogg or MP3 audio file.')
  if (file.size > MAX_RECORDING_BYTES) throw new Error('This file is larger than 5 MB.')
  if (file.size === 0) throw new Error('This file is empty.')
  const data = new Uint8Array(await file.arrayBuffer())
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  try {
    const seconds = await measure(url)
    if (seconds * 1000 > MAX_RECORDING_MS + 500) throw new Error('Messages can be up to 60 seconds long.')
    return { mime, data, durationMs: Math.min(MAX_RECORDING_MS, Math.max(1, Math.round(seconds * 1000))) }
  } finally {
    URL.revokeObjectURL(url)
  }
}
