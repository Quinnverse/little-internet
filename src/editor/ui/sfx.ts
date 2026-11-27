// Three tiny sounds, synthesised in the browser. No audio files, no autoplay:
// every sound follows a real pointer or key gesture, and one mute switch (kept
// in localStorage) silences all of them for this device.
const KEY = 'li-sound-muted'

let ctx: AudioContext | null = null
let muted = read()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function soundMuted(): boolean {
  return muted
}

export function setSoundMuted(v: boolean): void {
  muted = v
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* the switch still works for this visit */
  }
  if (!v) audio()
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Warm the context on the first gesture so the first real click is not late. */
export function primeSound(): void {
  if (!muted) audio()
}

function noise(c: AudioContext, seconds: number): AudioBufferSourceNode {
  const frames = Math.max(1, Math.floor(c.sampleRate * seconds))
  const buffer = c.createBuffer(1, frames, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  return src
}

function thud(c: AudioContext, at: number, peak: number, from: number, to: number): void {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(to, at + 0.12)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2)
  osc.connect(gain).connect(c.destination)
  osc.start(at)
  osc.stop(at + 0.24)
}

/** A door that opens a crack: a papery creak, then the latch letting go. */
function door(c: AudioContext): void {
  const now = c.currentTime
  const n = noise(c, 0.55)
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 7
  band.frequency.setValueAtTime(640, now)
  band.frequency.exponentialRampToValueAtTime(1120, now + 0.36)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.09)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
  n.connect(band).connect(gain).connect(c.destination)
  n.start(now)
  n.stop(now + 0.6)
  thud(c, now + 0.34, 0.05, 130, 62)
}

/** A wax stamp pressed onto a room card: one soft, low knock. */
function stamp(c: AudioContext): void {
  const now = c.currentTime
  const n = noise(c, 0.08)
  const low = c.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 480
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.03, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
  n.connect(low).connect(gain).connect(c.destination)
  n.start(now)
  n.stop(now + 0.1)
  thud(c, now, 0.055, 105, 60)
}

/** A sheet of paper picked up and laid down: two dry, short rustles. */
function paper(c: AudioContext): void {
  const now = c.currentTime
  for (const [offset, peak] of [
    [0, 0.016],
    [0.085, 0.011],
  ] as const) {
    const n = noise(c, 0.14)
    const high = c.createBiquadFilter()
    high.type = 'highpass'
    high.frequency.value = 1500
    const low = c.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 5400
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, now + offset)
    gain.gain.exponentialRampToValueAtTime(peak, now + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12)
    n.connect(high).connect(low).connect(gain).connect(c.destination)
    n.start(now + offset)
    n.stop(now + offset + 0.15)
  }
}

export function sfx(kind: 'door' | 'stamp' | 'paper'): void {
  if (muted) return
  const c = audio()
  if (!c) return
  if (kind === 'door') door(c)
  else if (kind === 'stamp') stamp(c)
  else paper(c)
}
