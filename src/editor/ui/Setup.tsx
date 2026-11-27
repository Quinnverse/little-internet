import { useEffect, useMemo, useState } from 'preact/hooks'
import { HOUSES, defaultRoom, type House } from '../../core/room.ts'
import { GHOST_COLORS, SITE_SLUG_PATTERN, type Project, type Result } from '../../core/schema.ts'
import type { HomeData } from '../../room3d/view.ts'
import { STYLES, type StyleId } from '../../core/design.ts'
import { createProject } from '../commands.ts'
import { DEMO_IDS, DEMO_TITLES, demoCopy } from '../../demo/homes.ts'
import { getLang, setLang, t, useLang, type Key } from '../i18n.ts'
import { suggestSiteSlug } from '../ids.ts'
import { ta } from '../i18nAtelier.ts'
import { ringHomes, siteUrl, type RingHome } from '../publish.ts'
import { Field, GhostIcon } from './common.tsx'
import { Icon } from './icons.tsx'
import { describeProject, pickProjectFile } from './files.ts'
import { Scene } from './Scene.tsx'

/** First run. The little house is already there behind the card, turning slowly. */
export function Setup(props: { onDone: (p: Project) => Result<Project> }) {
  const lang = useLang()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [house, setHouse] = useState<House>('cabin')
  const [style, setStyle] = useState<StyleId>('retro')
  const [demos, setDemos] = useState(false)
  const [live, setLive] = useState<RingHome[]>([])
  // Published demo homes on this server (real addresses, same webring that visitors walk).
  useEffect(() => {
    ringHomes('').then((h) => setLive(h.filter((x) => x.demo)), () => undefined)
  }, [])
  const [petName, setPetName] = useState('Boo')
  const [petColor, setPetColor] = useState<(typeof GHOST_COLORS)[number]>('white')
  const [error, setError] = useState<string | null>(null)

  const effectiveSlug = slugTouched ? slug : suggestSiteSlug(name)
  const slugOk = SITE_SLUG_PATTERN.test(effectiveSlug)

  const data: HomeData = useMemo(() => {
    const r = defaultRoom()
    return { house, wall: r.wall, floor: r.floor, light: 'day', decor: r.decor, memory: [], welcome: false, pet: { enabled: true, name: petName, color: petColor } }
  }, [house, petColor, petName])

  const create = () => {
    const title = name.trim() || t('setup.defaultName')
    if (!slugOk) return setError(t('setup.addressBad'))
    const project = createProject({ lang: getLang(), title, slug: effectiveSlug, style, ghostName: petName.trim() || 'Boo', ghostColor: petColor })
    project.room = { ...project.room, house }
    const r = props.onDone(project)
    if (!r.ok) setError(r.reason)
  }

  const load = async (kind: 'site' | 'backup') => {
    const r = await pickProjectFile(kind)
    if (!r) return
    if (!r.ok) return setError(r.reason)
    if (confirm(t('setup.open', { what: describeProject(r.value) }))) props.onDone(r.value)
  }

  return (
    <div class="setup-wrap">
      <Scene data={data} hotspots={[]} decorate={false} selected={null} drift onPick={() => undefined} />
      <button type="button" class="round lang-float" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} aria-label={t('hud.lang')}>
        <Icon name="globe" size={18} /><span class="lang-text">{lang === 'en' ? '中文' : 'EN'}</span>
      </button>
      <main class="setup">
        <div class="setup-hero">
          <h1>{t('setup.hero')}</h1>
          <p class="muted">{lang==='zh'?'我是 Boo，钥匙给你。先给家起个名字，进门后我带你认认路。':"I’m Boo. Here’s your key. Give this place a name and I’ll show you around."}</p>
        </div>

        <div class="card demo-card">
          {live.length > 0 && (
            <div class="demo-links">
              <p><strong>{ta('demo.visit')}</strong></p>
              <ul>
                {live.map((h) => (
                  <li key={h.slug}>
                    <a href={siteUrl(h.slug, '')} target="_blank" rel="noopener">{h.title}</a>
                    <span class="muted small"> · {h.tagline}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p>{ta('demo.pitch')}</p>
          {!demos ? (
            <button type="button" class="btn btn-block" onClick={() => setDemos(true)}>{ta('demo.try')}</button>
          ) : (
            <div class="demo-pick" role="group" aria-label={ta('demo.pick')}>
              {DEMO_IDS.map((id) => (
                <button
                  type="button"
                  key={id}
                  class="btn btn-block"
                  onClick={() => {
                    const r = props.onDone(demoCopy(id, `${location.origin}/`))
                    if (!r.ok) setError(r.reason)
                  }}
                >
                  {DEMO_TITLES[id]}
                </button>
              ))}
              <p class="muted small">{ta('demo.copyNote')}</p>
            </div>
          )}
        </div>

        <fieldset class="field">
          <legend class="field-label">{ta('setup.style')}</legend>
          <div class="style-pick">
            {STYLES.map((s) => (
              <button type="button" key={s} class={`style-swatch sw-${s}${style === s ? ' selected' : ''}`} aria-pressed={style === s} onClick={() => setStyle(s)}>
                <span class="sw-art" aria-hidden="true" />
                <span class="sw-name">{ta(`style.${s}`)}</span>
              </button>
            ))}
          </div>
          <span class="field-hint">{ta('setup.styleHint')}</span>
        </fieldset>

        <Field label={t('setup.name')}>
          <input value={name} maxLength={80} placeholder={t('setup.namePh')} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>

        <details class="more-opts">
          <summary>{ta('setup.more')}</summary>
        <Field label={t('setup.address')} hint={t('setup.addressHint', { slug: effectiveSlug || '…' })}>
          <input
            value={effectiveSlug}
            maxLength={32}
            autocapitalize="off"
            autocomplete="off"
            spellcheck={false}
            aria-invalid={!slugOk}
            onInput={(e) => {
              setSlugTouched(true)
              setSlug(e.currentTarget.value.toLowerCase())
            }}
          />
        </Field>

        <fieldset class="field">
          <legend class="field-label">{t('setup.house')}</legend>
          <div class="choice-row">
            {HOUSES.map((h) => (
              <button type="button" key={h} class={`chip ${house === h ? 'selected' : ''}`} aria-pressed={house === h} onClick={() => setHouse(h)}>
                {t(`house.${h}` as Key)}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label={t('setup.petName')}>
          <input value={petName} maxLength={24} onInput={(e) => setPetName(e.currentTarget.value)} />
        </Field>

        <fieldset class="field">
          <legend class="field-label">{t('setup.petColor')}</legend>
          <div class="choice-row">
            {GHOST_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                class={`ghost-chip ${petColor === c ? 'selected' : ''}`}
                aria-label={t(`color.${c}` as Key)}
                aria-pressed={petColor === c}
                onClick={() => setPetColor(c)}
              >
                <GhostIcon color={c} size={36} />
              </button>
            ))}
          </div>
        </fieldset>

        </details>

        {error && <p class="error" role="alert">{error}</p>}

        <button type="button" class="btn btn-primary btn-block" onClick={create}>
          {t('setup.moveIn')}
        </button>

        <div class="setup-alt">
          <p class="muted">{t('setup.have')}</p>
          <div class="choice-row">
            <button type="button" class="btn" onClick={() => load('backup')}>{t('setup.restore')}</button>
            <button type="button" class="btn" onClick={() => load('site')}>{t('setup.import')}</button>
          </div>
        </div>
      </main>
    </div>
  )
}
