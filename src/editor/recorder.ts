// Microphone recording for the voice time capsule (browser only).
import { AUDIO_MIMES, MAX_RECORDING_MS, type AudioMime } from '../core/schema.ts'

const CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']

export type Recorded = { mime: AudioMime; data: Uint8Array; durationMs: number }

export type RecorderHandle = {
  /** Stops and resolves with the recording. */
  stop: () => Promise<Recorded>
  cancel: () => void
  startedAt: number
}

export function recordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

function baseMime(type: string): AudioMime | null {
  const base = type.split(';')[0]!.trim().toLowerCase()
  return (AUDIO_MIMES as readonly string[]).includes(base) ? (base as AudioMime) : null
}

export function describeMicError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access was refused. You can allow it in the browser settings, or choose an audio file instead.'
  if (name === 'NotFoundError') return 'No microphone was found. You can choose an audio file instead.'
  return e instanceof Error ? e.message : 'Recording is not available here.'
}

/** Starts recording. Stops by itself at 60 s and calls `onAutoStop` with the result. */
export async function startRecording(onAutoStop: (r: Promise<Recorded>) => void): Promise<RecorderHandle> {
  if (!recordingSupported()) {
    throw new Error('Recording needs a secure (https) page and a browser with microphone support.')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const type = CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t))
  const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64_000 } : undefined)
  const chunks: Blob[] = []
  recorder.addEventListener('dataavailable', (e) => e.data.size && chunks.push(e.data))
  const startedAt = performance.now()
  let cancelled = false
  let finished: Promise<Recorded> | null = null

  const release = () => stream.getTracks().forEach((t) => t.stop())

  const stop = (): Promise<Recorded> => {
    finished ??= new Promise<Recorded>((resolve, reject) => {
      const durationMs = Math.min(MAX_RECORDING_MS, Math.max(1, Math.round(performance.now() - startedAt)))
      recorder.addEventListener(
        'stop',
        async () => {
          release()
          if (cancelled) return reject(new Error('cancelled'))
          const mime = baseMime(recorder.mimeType || type || '')
          if (!mime) return reject(new Error(`This browser records as ${recorder.mimeType || 'an unknown type'}, which is not supported.`))
          const blob = new Blob(chunks, { type: mime })
          resolve({ mime, data: new Uint8Array(await blob.arrayBuffer()), durationMs })
        },
        { once: true },
      )
      if (recorder.state !== 'inactive') recorder.stop()
    })
    return finished
  }

  const timer = window.setTimeout(() => onAutoStop(stop()), MAX_RECORDING_MS)
  recorder.addEventListener('stop', () => window.clearTimeout(timer), { once: true })
  recorder.start(1000)

  return {
    startedAt,
    stop,
    cancel: () => {
      cancelled = true
      window.clearTimeout(timer)
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
  }
}
