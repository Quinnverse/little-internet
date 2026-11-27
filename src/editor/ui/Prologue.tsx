import { useState } from 'preact/hooks'
import { setLang, t, useLang } from '../i18n.ts'
import { Icon } from './icons.tsx'
import { sfx } from './sfx.ts'

/**
 * The first thing anyone sees: a place, not a product page.
 *
 * The cover carries the world (one plot, one room, one door), then hands the owner
 * to the moving-in journal. It is deliberately a separate screen from the setup
 * form so the story can be read at its own pace, and skipped by people who only
 * want the demo homes.
 */
export function Prologue(props: { onStart: () => void; onDemo: () => void }) {
  const lang = useLang()
  const [opening, setOpening] = useState(false)
  const enter = () => {
    if (opening) return
    setOpening(true)
    // The story recedes, the paper comes forward: a door, not a page change.
    window.setTimeout(props.onStart, 460)
  }
  return (
    <div class={`cover${opening ? ' is-opening' : ''}`} role="main">
      <img class="cover-art" src="./art/prologue-hero.webp" alt="" aria-hidden="true" />
      <div class="cover-veil" aria-hidden="true" />
      <div class="cover-dust" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>

      <button
        type="button"
        class="cover-lang"
        onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
        aria-label={t('hud.lang')}
        title={t('hud.lang')}
      >
        <Icon name="globe" size={16} /> {lang === 'en' ? '中文' : 'EN'}
      </button>

      <div class="cover-inner">
        <p class="cover-chapter">
          <span class="cover-rule" aria-hidden="true" />
          {t('cover.chapter')}
        </p>
        <p class="cover-kicker">{t('cover.kicker')}</p>
        <h1 class="cover-title">
          <span class="cover-en">{t('cover.title')}</span>
          <span class="cover-alt">{t('cover.titleAlt')}</span>
        </h1>

        <div class="cover-story">
          <p class="cover-lore">{t('cover.lore')}</p>
          <p class="cover-lore cover-lore-soft">{t('cover.lore2')}</p>
        </div>

        <ul class="cover-rules">
          <li>
            <span class="cover-ico" aria-hidden="true">◍</span>
            <strong>{t('cover.rule1')}</strong>
            <span>{t('cover.rule1d')}</span>
          </li>
          <li>
            <span class="cover-ico" aria-hidden="true">⌁</span>
            <strong>{t('cover.rule2')}</strong>
            <span>{t('cover.rule2d')}</span>
          </li>
          <li>
            <span class="cover-ico" aria-hidden="true">⌂</span>
            <strong>{t('cover.rule3')}</strong>
            <span>{t('cover.rule3d')}</span>
          </li>
        </ul>

        <div class="cover-actions">
          <button
            type="button"
            class="btn-cover"
            onClick={() => {
              sfx('door')
              enter()
            }}
          >
            <span>{t('cover.enter')}</span>
            <Icon name="door" size={18} />
          </button>
          <button type="button" class="cover-ghost-btn" onClick={props.onDemo}>
            {t('cover.visit')}
          </button>
        </div>

        <p class="cover-foot">
          <span>{t('cover.foot')}</span>
          <span class="cover-foot-dot" aria-hidden="true">·</span>
          <span>{t('cover.minute')}</span>
        </p>
      </div>

      <div class="cover-scroll" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  )
}

/** The cover is remembered per device so a reload before moving in does not replay it every time. */
const COVER_KEY = 'li-cover-seen'

export function coverSeen(): boolean {
  try {
    return localStorage.getItem(COVER_KEY) === '1'
  } catch {
    return false
  }
}

export function markCoverSeen(): void {
  try {
    localStorage.setItem(COVER_KEY, '1')
  } catch {
    /* private mode: the cover simply shows again */
  }
}
