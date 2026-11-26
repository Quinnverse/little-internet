import { useEffect } from 'preact/hooks'
import { getLang } from '../i18n.ts'
import { GhostIcon } from './common.tsx'

export type BubbleTone = 'greet' | 'hint' | 'happy'

/**
 * A short line from Boo, anchored above the dock like a speech balloon.
 * Timed, dismissible, and never blocks the scene. Boo "speaks" in plain,
 * kind sentences — no claims about reading feelings.
 */
export function BooBubble(props: {
  line: string
  tone?: BubbleTone
  ms?: number
  onDone?: () => void
}) {
  useEffect(() => {
    if (!props.onDone) return
    const id = window.setTimeout(props.onDone, props.ms ?? 5200)
    return () => window.clearTimeout(id)
  }, [props.line, props.onDone, props.ms])

  if (!props.line) return null
  const zh = getLang() === 'zh'
  return (
    <div class={`boo-bubble tone-${props.tone ?? 'hint'}`} role="status" aria-live="polite">
      <span class="bb-avatar" aria-hidden="true"><GhostIcon color="white" size={30} /></span>
      <span class="bb-line">{props.line}</span>
      <button type="button" class="bb-close" onClick={props.onDone} aria-label={zh ? '关闭' : 'Dismiss'}>×</button>
    </div>
  )
}
