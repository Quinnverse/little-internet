import { useEffect, useState } from 'preact/hooks'
import { getLang } from '../i18n.ts'

/**
 * The "coming home" moment, shown once when a brand-new home is first opened.
 * A quiet full-screen veil with a line of copy; Home opens the door and has
 * Boo greet the owner underneath. Skippable, and respects reduced motion.
 */
export function Arrival(props: { onDone: () => void }) {
  const zh = getLang() === 'zh'
  const [leaving, setLeaving] = useState(false)
  const finish = () => {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(props.onDone, 650)
  }
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = window.setTimeout(finish, reduce ? 1800 : 4200)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div class={`arrival${leaving ? ' is-leaving' : ''}`} onClick={finish} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') finish() }} aria-label={zh ? '跳过开场' : 'Skip opening'}>
      <div class="arrival-art" aria-hidden="true">
        <span class="ar-door" />
        <span class="ar-glow" />
      </div>
      <div class="arrival-copy">
        <p class="ar-kicker">{zh ? '一个新家' : 'A new home'}</p>
        <h2>{zh ? '门开了。' : 'The door is open.'}</h2>
        <p>{zh ? '有人已经在里面等你了。' : 'Someone is already inside, waiting for you.'}</p>
        <small>{zh ? '点击任意处继续' : 'tap anywhere to continue'}</small>
      </div>
    </div>
  )
}
