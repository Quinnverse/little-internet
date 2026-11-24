import { useState } from 'preact/hooks'
import { GHOST_COLORS, SITE_SLUG_PATTERN } from '../../core/schema.ts'
import { compose, updateGhost, updateSite } from '../commands.ts'
import { setLang, t, useLang, type Key } from '../i18n.ts'
import { Field, GhostIcon, run, Sheet, type Ctx } from './common.tsx'

export function Settings(props: { ctx: Ctx; onClose: () => void; flat: boolean; setFlat: (v: boolean) => void }) {
  const lang = useLang()
  const { ctx } = props
  const { site, ghost } = ctx.project
  const [title, setTitle] = useState(site.title)
  const [tagline, setTagline] = useState(site.tagline)
  const [slug, setSlug] = useState(site.slug)
  const [petName, setPetName] = useState(ghost.name)

  const saveText = () => {
    if (!SITE_SLUG_PATTERN.test(slug)) return ctx.toast(t('setup.addressBad'), 'error')
    run(
      ctx,
      compose(updateSite({ title: title.trim() || site.title, tagline: tagline.trim(), slug }), updateGhost({ name: petName.trim() || ghost.name })),
      t('settings.saved'),
    )
  }

  return (
    <Sheet title={t('settings.title')} onClose={props.onClose}>
      <div class="card">
        <Field label={t('settings.name')}>
          <input value={title} maxLength={80} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label={t('settings.tagline')}>
          <input value={tagline} maxLength={200} placeholder={t('settings.taglinePh')} onInput={(e) => setTagline(e.currentTarget.value)} />
        </Field>
        <Field label={t('settings.address')} hint={t('settings.addressHint')}>
          <input value={slug} maxLength={32} autocapitalize="off" spellcheck={false} onInput={(e) => setSlug(e.currentTarget.value.toLowerCase())} />
        </Field>
        <Field label={t('settings.petName')}>
          <input value={petName} maxLength={24} onInput={(e) => setPetName(e.currentTarget.value)} />
        </Field>
        <button type="button" class="btn btn-primary" onClick={saveText}>{t('common.save')}</button>
      </div>

      <h3>{t('settings.language')}</h3>
      <div class="choice-row">
        {(['en', 'zh'] as const).map((l) => (
          <button
            type="button"
            key={l}
            class={`chip ${lang === l ? 'selected' : ''}`}
            aria-pressed={lang === l}
            onClick={() => {
              setLang(l)
              run(ctx, updateSite({ lang: l }))
            }}
          >
            {l === 'en' ? 'English' : '中文'}
          </button>
        ))}
      </div>

      <h3>{t('settings.petColor')}</h3>
      <div class="choice-row">
        {GHOST_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            class={`ghost-chip ${ghost.color === c ? 'selected' : ''}`}
            aria-label={t(`color.${c}` as Key)}
            aria-pressed={ghost.color === c}
            onClick={() => run(ctx, updateGhost({ color: c }))}
          >
            <GhostIcon color={c} size={36} />
          </button>
        ))}
      </div>
      <label class="switch-row">
        <input type="checkbox" checked={ghost.enabled} onChange={(e) => run(ctx, updateGhost({ enabled: e.currentTarget.checked }))} />
        <span>{t('settings.petOn')}</span>
      </label>
      <label class="switch-row">
        <input type="checkbox" checked={props.flat} onChange={(e) => props.setFlat(e.currentTarget.checked)} />
        <span>
          {t('settings.low')} <span class="muted small">{t('settings.lowHint')}</span>
        </span>
      </label>
    </Sheet>
  )
}
