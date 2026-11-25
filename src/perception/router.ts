import type { PerceptionEvent } from './types.ts'

/**
 * Decides what a perception event may do, depending on what the person is doing right now.
 * The same heart gesture makes Boo happy at home, is ignored while drawing, and only *proposes* a gift in send mode.
 * No action here can send, delete, publish or change anything: a proposal is shown to the owner, who confirms with a tap.
 */
export type Mode = 'idle' | 'boo' | 'draw' | 'send'
export type BooReaction = 'greet' | 'catch-heart' | 'come' | 'happy'

export type Action =
  | { kind: 'cursor'; x: number; y: number }
  | { kind: 'boo'; reaction: BooReaction; eventId: string }
  | { kind: 'draw'; op: 'begin' | 'point' | 'end'; x: number; y: number; eventId: string }
  | { kind: 'propose-gift'; gift: 'heart'; eventId: string }

export const MIN_CONFIDENCE = 0.5

const BOO: Partial<Record<PerceptionEvent['eventType'], BooReaction>> = { wave: 'greet', heart: 'catch-heart', open_palm: 'come', thumbs_up: 'happy' }

export class ContextRouter {
  private current: Mode = 'idle'
  private pen = false
  private last = { x: 0.5, y: 0.5 }

  get mode(): Mode {
    return this.current
  }

  /** Switching away from drawing lifts the pen first. */
  setMode(m: Mode): Action[] {
    const out: Action[] = []
    if (this.pen && m !== 'draw') {
      out.push({ kind: 'draw', op: 'end', ...this.last, eventId: 'mode-change' })
      this.pen = false
    }
    this.current = m
    return out
  }

  route(e: PerceptionEvent): Action[] {
    if (e.confidence < MIN_CONFIDENCE) return []
    if (e.x !== undefined && e.y !== undefined) this.last = { x: e.x, y: e.y }
    const at = this.last
    const out: Action[] = []

    if (this.current === 'draw') {
      if (e.eventType === 'pinch_start') {
        this.pen = true
        out.push({ kind: 'draw', op: 'begin', ...at, eventId: e.eventId })
      } else if (e.eventType === 'pointer_move') {
        out.push(this.pen ? { kind: 'draw', op: 'point', ...at, eventId: e.eventId } : { kind: 'cursor', ...at })
      } else if (e.eventType === 'pinch_end' || (e.eventType === 'hand_lost' && this.pen)) {
        this.pen = false
        out.push({ kind: 'draw', op: 'end', ...at, eventId: e.eventId })
      }
      return out
    }

    if (e.eventType === 'pointer_move') return [{ kind: 'cursor', ...at }]
    if (this.current === 'boo') {
      const reaction = BOO[e.eventType]
      if (reaction) out.push({ kind: 'boo', reaction, eventId: e.eventId })
    } else if (this.current === 'send' && e.eventType === 'heart') {
      out.push({ kind: 'propose-gift', gift: 'heart', eventId: e.eventId })
    }
    return out
  }
}
