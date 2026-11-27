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
import { GhostIcon } from './common.tsx'
import { Icon } from './icons.tsx'
import { describeProject, pickProjectFile } from './files.ts'
import { Scene } from './Scene.tsx'
import { sfx, setSoundMuted, soundMuted } from './sfx.ts'

/** Marks a freshly created home so Day One knows it may offer its three small tasks. */
export function markDayOne(slug: string): void {
  try {
    localStorage.setItem(`li-day1-${slug}`, 'on')
  } catch {
    /* the journal simply stays closed */
  }
}

/**
 * Moving in as a room you stand in, not a panel you fill out.
 *
 * The 3D room is the whole stage. The four decisions are physical things on a
 * wooden table at the bottom — a brass door plate, two room cards with keys, Boo
 * and his paints, a fan of paper samples, and a door to push. Boo talks above the
 * table; every object is still a real, labelled control.
 */
export function Setup(props: { onDone: (p: Project) => Result<Project>; onBack?: () => void; openDemos?: boolean }) {
  const lang = useLang()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [house, setHouse] = useState<House>('cabin')
  const [style, setStyle] = useState<StyleId>('retro')
  const [demos, setDemos] = useState(!!props.openDemos)
  const [live, setLive] = useState<RingHome[]>([])
  // Published demo homes on this server (real addresses, same webring that visitors walk).
  useEffect(() => {
    ringHomes('').then((h) => setLive(h.filter((x) => x.demo)), () => undefined)
  }, [])
  const [petName, setPetName] = useState('Boo')
  const [petColor, setPetColor] = useState<(typeof GHOST_COLORS)[number]>('white')
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [muted, setMuted] = useState(soundMuted())

  // Desktop opens with the cursor already on the brass plate, like a game asking
  // for your name. Phones keep the keyboard down until you tap the plate.
  useEffect(() => {
    if (window.matchMedia('(min-width: 900px)').matches) {
      document.querySelector<HTMLInputElement>('.gs-plate input')?.focus({ preventScroll: true })
    }
  }, [])

  const effectiveSlug = slugTouched ? slug : suggestSiteSlug(name)
  const slugOk = SITE_SLUG_PATTERN.test(effectiveSlug)

  const data: HomeData = useMemo(() => {
    const r = defaultRoom()
    return { house, wall: r.wall, floor: r.floor, light: 'day', decor: r.decor, memory: [], welcome: false, pet: { enabled: true, name: petName, color: petColor } }
  }, [house, petColor, petName])

  const guides = [t('ga.guide1'), t('ga.guide2'), t('ga.guide3'), t('ga.guide4')]
  const guide = guides[active] ?? guides[0]

  const create = () => {
    const title = name.trim() || t('setup.defaultName')
    if (!slugOk) return setError(t('setup.addressBad'))
    const project = createProject({ lang: getLang(), title, slug: effectiveSlug, style, ghostName: petName.trim() || 'Boo', ghostColor: petColor })
    project.room = { ...project.room, house }
    const r = props.onDone(project)
    if (!r.ok) setError(r.reason)
    else markDayOne(effectiveSlug)
  }

  const load = async (kind: 'site' | 'backup') => {
    const r = await pickProjectFile(kind)
    if (!r) return
    if (!r.ok) return setError(r.reason)
    if (confirm(t('setup.open', { what: describeProject(r.value) }))) props.onDone(r.value)
  }

  return (
    <div class="setup-wrap gs-wrap">
      <Scene data={data} hotspots={[]} decorate={false} selected={null} drift onPick={() => undefined} />
      <div class="gs-shade" aria-hidden="true" />

      <header class="gs-top">
        <div class="gs-top-left">
          <span class="gs-house-mark" aria-hidden="true">◍</span>
          <span class="gs-journal">{t('ga.kicker')}</span>
        </div>
        <div class="gs-top-right">
          {props.onBack && (
            <button type="button" class="gs-link" onClick={props.onBack}>
              <span aria-hidden="true">←</span> {t('ga.back')}
            </button>
          )}
          <button
            type="button"
            class="gs-lang gs-sound"
            aria-pressed={muted}
            aria-label={t(muted ? 'ga.soundOff' : 'ga.soundOn')}
            title={t(muted ? 'ga.soundOff' : 'ga.soundOn')}
            onClick={() => {
              const next = !muted
              setMuted(next)
              setSoundMuted(next)
            }}
          >
            <Icon name={muted ? 'mute' : 'sound'} size={15} />
          </button>
          <button
            type="button"
            class="gs-lang"
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            aria-label={t('hud.lang')}
            title={t('hud.lang')}
          >
            <Icon name="globe" size={15} /> {lang === 'en' ? '中文' : 'EN'}
          </button>
        </div>
      </header>

      <div class="gs-heading">
        <h1>{t('setup.hero')}</h1>
        <p class="gs-sub">{t('setup.sub')}</p>
        <ol class="gs-steps" aria-label={t('ga.step', { n: 4 })}>
          {(['name', 'house', 'pet', 'paper'] as const).map((k, i) => (
            <li key={k} class={active === i ? 'on' : ''}>
              <span>{i + 1}</span>
              {t(`ga.${k}T` as Key)}
            </li>
          ))}
        </ol>
      </div>

      <main class="setup gs-desk">
        <div class="gs-boo" aria-live="polite">
          <div class="gs-bubble">
            <p>{guide}</p>
            <i aria-hidden="true" />
          </div>
          <img class="gs-boo-img" src="./art/boo-guide.webp" alt="" aria-hidden="true" />
        </div>

        <section
          class="gs-spot gs-spot-name"
          onPointerEnter={() => setActive(0)}
          onFocusIn={() => setActive(0)}
        >
          <span class="gs-tag" aria-hidden="true">01 · {t('ga.nameT')}</span>
          <label class="gs-plate">
            <span class="gs-plate-label">{t('setup.name')}</span>
            <input value={name} maxLength={80} placeholder={t('setup.namePh')} onInput={(e) => setName(e.currentTarget.value)} />
            <span class="gs-plate-hint">{t('ga.nameHint')}</span>
            <i class="gs-screw s1" aria-hidden="true" />
            <i class="gs-screw s2" aria-hidden="true" />
          </label>
          <details class="gs-more">
            <summary>{t('ga.more')}</summary>
            <label class="gs-more-field">
              <span>{t('setup.address')}</span>
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
              <span class="gs-more-hint">{t('setup.addressHint', { slug: effectiveSlug || '…' })}</span>
            </label>
          </details>
        </section>

        <section
          class="gs-spot gs-spot-house"
          onPointerEnter={() => setActive(1)}
          onFocusIn={() => setActive(1)}
        >
          <span class="gs-tag" aria-hidden="true">02 · {t('ga.houseT')}</span>
          <div class="gs-keys" role="group" aria-label={t('setup.house')}>
            {HOUSES.map((h) => (
              <button
                type="button"
                key={h}
                class={`gs-room-card${house === h ? ' selected' : ''}`}
                aria-pressed={house === h}
                onClick={() => {
                  sfx('stamp')
                  setHouse(h)
                }}
              >
                <span class="gs-room-photo">
                  <img src={`./art/house-${h}.webp`} alt="" aria-hidden="true" />
                  <span class="gs-room-tag">{t(`house.${h}` as Key)}</span>
                  <span class="gs-room-seal" aria-hidden="true">✓</span>
                </span>
                <span class="gs-room-key" aria-hidden="true">
                  <svg viewBox="0 0 60 22" width="46" height="17">
                    <circle cx="12" cy="11" r="6" />
                    <path d="M18 11h34M46 11v6M40 11v4" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
          <p class="gs-house-cap">{t(`ga.${house}D` as Key)}</p>
        </section>

        <section
          class="gs-spot gs-spot-pet"
          onPointerEnter={() => setActive(2)}
          onFocusIn={() => setActive(2)}
        >
          <span class="gs-tag" aria-hidden="true">03 · {t('ga.petT')}</span>
          <div class={`gs-boo-figure pc-${petColor}`}>
            <GhostIcon color={petColor} size={72} />
            <span class="gs-boo-shadow" aria-hidden="true" />
          </div>
          <div class="gs-paints" role="group" aria-label={t('setup.petColor')}>
            {GHOST_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                class={`gs-paint gp-${c}${petColor === c ? ' selected' : ''}`}
                aria-label={t(`color.${c}` as Key)}
                aria-pressed={petColor === c}
                onClick={() => setPetColor(c)}
              />
            ))}
          </div>
          <label class="gs-name-slip">
            <span>{t('setup.petName')}</span>
            <input value={petName} maxLength={24} onInput={(e) => setPetName(e.currentTarget.value)} />
          </label>
        </section>

        <section
          class="gs-spot gs-spot-paper"
          onPointerEnter={() => setActive(3)}
          onFocusIn={() => setActive(3)}
        >
          <span class="gs-tag" aria-hidden="true">04 · {t('ga.paperT')}</span>
          <div class="gs-papers" role="group" aria-label={t('ga.paperT')}>
            {STYLES.map((s) => (
              <button
                type="button"
                key={s}
                class={`gs-paper ps-${s}${style === s ? ' selected' : ''}`}
                aria-pressed={style === s}
                title={ta(`style.${s}`)}
                onClick={() => {
                  sfx('paper')
                  setStyle(s)
                }}
              >
                <span class={`sw-art sw-${s}`} aria-hidden="true" />
              </button>
            ))}
          </div>
          <p class="gs-paper-cap">{ta(`style.${style}`)}</p>
        </section>

        <section
          class="gs-spot gs-spot-door"
          onPointerEnter={() => setActive(3)}
          onFocusIn={() => setActive(3)}
        >
          <button
            type="button"
            class="gs-door"
            onClick={() => {
              sfx('door')
              create()
            }}
          >
            <span class="gs-door-shape" aria-hidden="true">
              <span class="gs-door-knob" />
              <span class="gs-door-light" />
            </span>
            <span class="gs-door-label">{t('setup.moveIn')}</span>
            <small>{t('ga.ctaNote')}</small>
            <Icon name="door" size={16} />
          </button>
        </section>

        {error && <p class="error gs-error" role="alert">{error}</p>}

        <div class="gs-utility">
          {live.length > 0 && (
            <details class="gs-neighbours">
              <summary>{t('cover.visit')}</summary>
              <ul>
                {live.map((h) => (
                  <li key={h.slug}>
                    <a href={siteUrl(h.slug, '')} target="_blank" rel="noopener">{h.title}</a>
                    <span> · {h.tagline}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button type="button" class="gs-utility-btn" onClick={() => setDemos(true)}>{t('ga.demo')}</button>
          {demos && (
            <div class="gs-demo-pick" role="group" aria-label={ta('demo.pick')}>
              {DEMO_IDS.map((id) => (
                <button
                  type="button"
                  key={id}
                  class="gs-demo-btn"
                  onClick={() => {
                    const r = props.onDone(demoCopy(id, `${location.origin}/`))
                    if (!r.ok) setError(r.reason)
                  }}
                >
                  {DEMO_TITLES[id]}
                </button>
              ))}
            </div>
          )}
          <details class="gs-have">
            <summary>{t('setup.have')}</summary>
            <div>
              <button type="button" onClick={() => load('backup')}>{t('setup.restore')}</button>
              <button type="button" onClick={() => load('site')}>{t('setup.import')}</button>
            </div>
          </details>
        </div>
      </main>

    </div>
  )
}
