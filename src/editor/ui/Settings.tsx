import { useEffect, useState } from 'preact/hooks'
import { GHOST_COLORS, SITE_SLUG_PATTERN } from '../../core/schema.ts'
import { compose, updateGhost, updateSite } from '../commands.ts'
import { idbDelete } from '../idb.ts'
import { resetState } from '../store.ts'
import { ta } from '../i18nAtelier.ts'
import { ambientVolume, primeSound, setAmbientVolume, startAmbient, stopAmbient } from './sfx.ts'
import { Icon } from './icons.tsx'
import { setLang, t, useLang, type Key } from '../i18n.ts'
import { GhostIcon, run, type Ctx } from './common.tsx'

/**
 * The room handbook.
 *
 * It is deliberately *not* a dialog: no backdrop, no page that slides over the room. It is a paper
 * book that lives on the desk, laid slightly crooked, and every control changes the room while you
 * are looking at it. That is the whole difference between "settings" and "the settings page of a
 * website".
 */
export function Settings(props: { ctx: Ctx; onClose: () => void; flat: boolean; setFlat: (v: boolean) => void; assist: boolean; setAssist: (v: boolean) => void }) {
  const lang = useLang()
  const { ctx } = props
  const { site, ghost } = ctx.project
  const [sign, setSign] = useState(ctx.project.privateHome?.sign ?? 'HOME')
  const [volume, changeVolume] = useState(ambientVolume())
  const [tab, setTab] = useState<'room' | 'name' | 'boo' | 'device'>('room')
  const zh = lang === 'zh'
  const [title, setTitle] = useState(site.title)
  const [tagline, setTagline] = useState(site.tagline)
  const [slug, setSlug] = useState(site.slug)
  const [petName, setPetName] = useState(ghost.name)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const saveText = () => {
    if (!SITE_SLUG_PATTERN.test(slug)) return ctx.toast(t('setup.addressBad'), 'error')
    run(
      ctx,
      compose(updateSite({ title: title.trim() || site.title, tagline: tagline.trim(), slug }), updateGhost({ name: petName.trim() || ghost.name })),
      t('settings.saved'),
    )
  }

  const tabs = (['room', 'name', 'boo', 'device'] as const).map((v, i) => ({
    v,
    label: (zh ? ['房间', '门牌', 'Boo', '本机'] : ['Room', 'Doorplate', 'Boo', 'Device'])[i]!,
  }))
  const heading = {
    room: zh ? '屋里的光' : 'Light in the room',
    name: zh ? '门口的名牌' : 'The name by the door',
    boo: zh ? 'Boo 的样子' : 'How Boo looks',
    device: zh ? '这台设备' : 'This device',
  }[tab]

  const period = ctx.project.privateHome?.period ?? 'auto'
  const lightTrigger = ctx.project.privateHome?.lightTrigger ?? 'enter'

  return (
    <div class="hb" role="dialog" aria-modal="false" aria-label={zh ? '房间手册' : 'Room handbook'}>
      <header class="hb-head">
        <div>
          <p class="hb-kicker">{zh ? '房间手册' : 'THE ROOM HANDBOOK'}</p>
          <h2>{heading}</h2>
        </div>
        <button type="button" class="hb-close" onClick={props.onClose} aria-label={zh ? '合上手册' : 'Fold the book'}>×</button>
      </header>

      <nav class="hb-tabs" aria-label={zh ? '手册书签' : 'Bookmarks'}>
        {tabs.map((x) => (
          <button type="button" key={x.v} aria-pressed={tab === x.v} onClick={() => setTab(x.v)}>
            {x.label}
          </button>
        ))}
      </nav>

      <div class="hb-body" key={tab}>
        {tab === 'room' && (
          <>
            <Row wide label={zh ? '屋里的光' : 'The light'} hint={zh ? '挑一张颜色，房间会马上跟着变' : 'Pick one; the room changes as you look at it'}>
              <div class="hb-chips">
                {(['morning', 'afternoon', 'dusk', 'midnight', 'auto'] as const).map((v, i) => (
                  <button
                    type="button"
                    key={v}
                    class={`hb-chip swatch-${v}`}
                    aria-pressed={period === v}
                    onClick={() =>
                      run(ctx, (p) => ({
                        ...p,
                        privateHome: { ...p.privateHome, period: v },
                        room: { ...p.room, light: v === 'midnight' ? 'night' : v === 'auto' ? 'auto' : 'day' },
                      }))
                    }
                  >
                    <i aria-hidden="true" />
                    <span>{(zh ? ['清晨', '午后', '黄昏', '深夜', '跟着时间'] : ['Morning', 'Afternoon', 'Dusk', 'Midnight', 'Local time'])[i]}</span>
                  </button>
                ))}
              </div>
            </Row>

            <Row wide label={zh ? '墙上的灯语' : 'Words in lights'} hint={zh ? '回家时会在墙上亮起来' : 'They light up when you come home'}>
              <form
                class="hb-inkline"
                onSubmit={(e) => {
                  e.preventDefault()
                  run(ctx, (p) => ({ ...p, privateHome: { ...p.privateHome, sign: sign.trim() || 'HOME' } }), t('settings.saved'))
                }}
              >
                <input maxLength={48} value={sign} onInput={(e) => setSign(e.currentTarget.value)} aria-label={zh ? '灯语内容' : 'Words in lights'} />
                <button type="submit" class="hb-mini">{zh ? '挂上去' : 'Hang it'}</button>
              </form>
            </Row>

            <Row wide label={zh ? '什么时候亮' : 'When they light'} hint={zh ? '灯串不必一直亮着' : 'They do not have to be on all the time'}>
              <Seg
                value={lightTrigger}
                options={[
                  ['enter', zh ? '回家' : 'Coming home'],
                  ['lamps', zh ? '开灯' : 'With lamps'],
                  ['touch', zh ? '触碰' : 'On touch'],
                ]}
                onChange={(v) => run(ctx, (p) => ({ ...p, privateHome: { ...p.privateHome, lightTrigger: v as 'enter' | 'lamps' | 'touch' } }))}
              />
            </Row>

            <Row wide label={zh ? '窗外的虫鸣' : 'Crickets outside'} hint={zh ? '只是想听见屋子外面' : 'Just enough to hear the outside'}>
              <div class="hb-slider">
                <input
                  class="hb-range"
                  aria-label={zh ? '环境音量' : 'Room tone volume'}
                  type="range" min="0" max="1" step=".05" value={volume}
                  onInput={(e) => {
                    const v = +e.currentTarget.value
                    changeVolume(v)
                    setAmbientVolume(v)
                    if (v) {
                      primeSound()
                      startAmbient()
                    } else stopAmbient()
                  }}
                />
                <span class="hb-ticks" aria-hidden="true"><i /><i /><i /><i /><i /></span>
              </div>
            </Row>

            <Row label={ta('hud.assistAlways')} hint={ta('hud.assistHint')}>
              <Toggle on={props.assist} label={ta('hud.assistAlways')} onChange={props.setAssist} />
            </Row>
            <Row label={t('settings.low')} hint={t('settings.lowHint')}>
              <Toggle on={props.flat} label={t('settings.low')} onChange={props.setFlat} />
            </Row>
          </>
        )}

        {tab === 'name' && (
          <>
            <Row label={t('settings.name')}>
              <input class="hb-text" value={title} maxLength={80} onInput={(e) => setTitle(e.currentTarget.value)} />
            </Row>
            <Row label={t('settings.tagline')}>
              <input class="hb-text" value={tagline} maxLength={200} placeholder={t('settings.taglinePh')} onInput={(e) => setTagline(e.currentTarget.value)} />
            </Row>
            <Row label={t('settings.address')} hint={t('settings.addressHint')}>
              <input class="hb-text" value={slug} maxLength={32} autocapitalize="off" spellcheck={false} onInput={(e) => setSlug(e.currentTarget.value.toLowerCase())} />
            </Row>
            <Row label={t('settings.petName')}>
              <input class="hb-text" value={petName} maxLength={24} onInput={(e) => setPetName(e.currentTarget.value)} />
            </Row>
            <button type="button" class="hb-stamp" onClick={saveText}>{t('common.save')}</button>
          </>
        )}

        {tab === 'boo' && (
          <>
            <Row wide label={t('settings.petColor')} hint={zh ? '它自己挑的颜色也能改' : 'Its own choice can be changed too'}>
              <div class="hb-ghosts">
                {GHOST_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    class={`hb-ghost ${ghost.color === c ? 'is-on' : ''}`}
                    aria-label={t(`color.${c}` as Key)}
                    aria-pressed={ghost.color === c}
                    onClick={() => run(ctx, updateGhost({ color: c }))}
                  >
                    <GhostIcon color={c} size={32} />
                  </button>
                ))}
              </div>
            </Row>
            <Row label={t('settings.petOn')} hint={zh ? '关掉之后它就只是在屋子里待着' : 'Turned off, it just stays in the room'}>
              <Toggle on={ghost.enabled} label={t('settings.petOn')} onChange={(v) => run(ctx, updateGhost({ enabled: v }))} />
            </Row>
          </>
        )}

        {tab === 'device' && (
          <>
            <Row label={t('settings.language')}>
              <Seg
                value={lang}
                options={[['zh', '中文'], ['en', 'English']]}
                onChange={(v) => {
                  setLang(v as 'zh' | 'en')
                  run(ctx, updateSite({ lang: v as 'zh' | 'en' }))
                }}
              />
            </Row>

            <div class="hb-danger">
              <p class="hb-kicker">{ta('reset.title')}</p>
              <p class="hb-small">{ta('reset.body')}</p>
              <button
                type="button"
                class="hb-wipe"
                onClick={async () => {
                  if (!confirm(ta('reset.confirm'))) return
                  resetState.on = true
                  try {
                    await idbDelete('project')
                    window.location.replace(window.location.pathname)
                  } catch (e) {
                    resetState.on = false
                    ctx.toast(String(e), 'error')
                  }
                }}
              >
                <Icon name="trash" size={16} /> {ta('reset.button')}
              </button>
            </div>
          </>
        )}
      </div>

      <footer class="hb-foot">
        <span>{zh ? '改动会立刻生效' : 'Changes apply as you make them'}</span>
        <button type="button" class="hb-fold" onClick={props.onClose}>{zh ? '合上' : 'Fold away'}</button>
      </footer>
    </div>
  )
}

function Row(props: { label: string; hint?: string; wide?: boolean; children: preact.ComponentChildren }) {
  return (
    <div class={`hb-row${props.wide ? ' is-wide' : ''}`}>
      <span class="hb-label">{props.label}</span>
      {props.hint && <em class="hb-hint">{props.hint}</em>}
      <div class="hb-ctl">{props.children}</div>
    </div>
  )
}

function Toggle(props: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" class="hb-switch" role="switch" aria-checked={props.on} aria-label={props.label} onClick={() => props.onChange(!props.on)}>
      <i aria-hidden="true" />
    </button>
  )
}

function Seg(props: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div class="hb-seg">
      {props.options.map(([v, label]) => (
        <button type="button" key={v} aria-pressed={props.value === v} onClick={() => props.onChange(v)}>{label}</button>
      ))}
    </div>
  )
}
