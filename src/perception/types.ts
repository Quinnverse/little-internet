/**
 * Perception events. The camera never leaves the device: only these small, anonymous events leave the tracker.
 * No frame, no face and no identity is stored or sent, and nothing here describes a person's emotion.
 */
export type Pt = { x: number; y: number; z?: number }

/** One tracked hand: 21 landmarks in image space (0..1, y grows downward, NOT mirrored). */
export type Hand = { points: readonly Pt[]; score: number; handedness: 'Left' | 'Right' }
export type Frame = { t: number; hands: readonly Hand[] }

export const GESTURES = ['wave', 'heart', 'open_palm', 'thumbs_up'] as const
export type GestureKind = (typeof GESTURES)[number]
export type PerceptionEventType = GestureKind | 'pinch_start' | 'pinch_end' | 'pointer_move' | 'hand_found' | 'hand_lost'

export type PerceptionEvent = {
  eventId: string
  eventType: PerceptionEventType
  /** Milliseconds on the frame clock. */
  timestamp: number
  source: 'camera-hand'
  /** 0..1. Tracker score, lowered when the pose was only just held long enough. */
  confidence: number
  interactionSessionId: string
  /** Position in the viewer's mirrored view, 0..1 (pointer_move, pinch_start, pinch_end). */
  x?: number
  y?: number
}

export const LM = { wrist: 0, thumbCmc: 1, thumbMcp: 2, thumbIp: 3, thumbTip: 4, indexMcp: 5, indexPip: 6, indexDip: 7, indexTip: 8, middleMcp: 9, middlePip: 10, middleTip: 12, ringMcp: 13, ringPip: 14, ringTip: 16, pinkyMcp: 17, pinkyPip: 18, pinkyTip: 20 } as const
