// Four sounds, all synthesised in the browser: three small gestures (door, wax,
// paper) and one room tone — crickets outside, a filament humming inside. No
// audio files, no autoplay: everything follows a real pointer or key gesture,
// one mute switch silences all of it, and the room tone has its own volume.
const MUTE_KEY = 'li-sound-muted'
const VOL_KEY = 'li-ambient-volume'

let ctx: AudioContext | null = null
let muted = readBool(MUTE_KEY)
let volume = readVolume()
let wanted = false
let ambient: { master: GainNode; timer: number; nodes: AudioNode[] } | null = null

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOL_KEY)
    if (raw === null) return 0.4
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.4
  } catch {
    return 0.4
  }
}

export function soundMuted(): boolean {
  return muted
}

export function setSoundMuted(v: boolean): void {
  muted = v
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0')
  } catch {
    /* the switch still works for this visit */
  }
  if (v) stopAmbient()
  else if (wanted) startAmbient()
}

export function ambientVolume(): number {
  return volume
}

export function setAmbientVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v))
  try {
    localStorage.setItem(VOL_KEY, String(volume))
  } catch {
    /* the slider still works for this visit */
  }
  if (ambient) ambient.master.gain.setTargetAtTime(volume * 0.5, ambient.master.context.currentTime, 0.2)
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

/** The wall switch: a plastic click, then the filament catching. */
function lampSwitch(c: AudioContext, on: boolean): void {
  const now = c.currentTime
  const n = noise(c, 0.03)
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 1.6
  band.frequency.value = on ? 2300 : 1800
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
  n.connect(band).connect(gain).connect(c.destination)
  n.start(now)
  n.stop(now + 0.05)
  if (on) {
    // a filament answers half a beat later, and only when it is being switched on
    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = 232
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, now + 0.06)
    g.gain.exponentialRampToValueAtTime(0.012, now + 0.14)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)
    const low = c.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 900
    osc.connect(low).connect(g).connect(c.destination)
    osc.start(now + 0.06)
    osc.stop(now + 0.34)
  }
}

/** Wrapping paper and one small bell: the gift's two beats. */
function chime(c: AudioContext): void {
  const now = c.currentTime
  const n = noise(c, 0.26)
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 0.6
  band.frequency.setValueAtTime(2300, now)
  band.frequency.exponentialRampToValueAtTime(1600, now + 0.2)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.006, now)
  gain.gain.exponentialRampToValueAtTime(0.03, now + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
  n.connect(band).connect(gain).connect(c.destination)
  n.start(now)
  n.stop(now + 0.3)
  for (const [freq, peak, dur] of [
    [784, 0.02, 0.9],
    [1176, 0.008, 0.7],
  ] as const) {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, now + 0.34)
    g.gain.exponentialRampToValueAtTime(peak, now + 0.38)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38 + dur)
    osc.connect(g).connect(c.destination)
    osc.start(now + 0.34)
    osc.stop(now + 0.4 + dur)
  }
}

/** One cricket, two or three dry chirps, a little way off in the garden. */
function chirp(c: AudioContext, master: GainNode): void {
  const now = c.currentTime + Math.random() * 0.6
  const pitch = 3200 + Math.random() * 900
  const count = 2 + (Math.random() < 0.4 ? 1 : 0)
  for (let i = 0; i < count; i += 1) {
    const at = now + i * 0.055
    const n = noise(c, 0.03)
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 16
    band.frequency.value = pitch
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.012, at + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.026)
    n.connect(band).connect(gain).connect(master)
    n.start(at)
    n.stop(at + 0.04)
  }
}

/**
 * The room tone: a low filament hum, a whisper of air, and crickets outside.
 * Very quiet by design — it should be noticed only when it stops.
 */
export function startAmbient(): void {
  wanted = true
  if (muted || ambient) return
  const c = audio()
  if (!c) return

  const master = c.createGain()
  master.gain.value = volume * 0.5
  master.connect(c.destination)

  const nodes: AudioNode[] = [master]

  // Filament hum: 96 Hz with a soft second harmonic.
  for (const [freq, peak] of [
    [96, 0.028],
    [192, 0.008],
  ] as const) {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const gain = c.createGain()
    gain.gain.value = peak
    const low = c.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 420
    osc.connect(low).connect(gain).connect(master)
    osc.start()
    nodes.push(osc, gain, low)
  }

  // Air in the room: a slow, low noise bed.
  const air = noise(c, 4)
  air.loop = true
  const airLow = c.createBiquadFilter()
  airLow.type = 'lowpass'
  airLow.frequency.value = 380
  const airGain = c.createGain()
  airGain.gain.value = 0.05
  air.connect(airLow).connect(airGain).connect(master)
  air.start()
  nodes.push(air, airLow, airGain)

  const timer = window.setInterval(() => {
    if (Math.random() < 0.75) chirp(c, master)
  }, 1700)
  ambient = { master, timer, nodes }
}

export function stopAmbient(): void {
  wanted = false
  if (!ambient) return
  window.clearInterval(ambient.timer)
  for (const node of ambient.nodes) {
    try {
      const stoppable = node as OscillatorNode & AudioBufferSourceNode
      if (typeof stoppable.stop === 'function') stoppable.stop()
      node.disconnect()
    } catch {
      /* already gone */
    }
  }
  ambient.master.disconnect()
  ambient = null
}

export function sfx(kind: 'door' | 'stamp' | 'paper' | 'lamp' | 'lampOff' | 'chime'): void {
  if (muted) return
  const c = audio()
  if (!c) return
  if (kind === 'door') door(c)
  else if (kind === 'stamp') stamp(c)
  else if (kind === 'lamp') lampSwitch(c, true)
  else if (kind === 'lampOff') lampSwitch(c, false)
  else if (kind === 'chime') chime(c)
  else paper(c)
}
