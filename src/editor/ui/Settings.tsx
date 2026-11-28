import { useState } from 'preact/hooks'
import { GHOST_COLORS, SITE_SLUG_PATTERN } from '../../core/schema.ts'
import { compose, updateGhost, updateSite } from '../commands.ts'
import { idbDelete } from '../idb.ts'
import { resetState } from '../store.ts'
import { ta } from '../i18nAtelier.ts'
import {ambientVolume,primeSound,setAmbientVolume,startAmbient,stopAmbient} from './sfx.ts'
import { Icon } from './icons.tsx'
import { setLang, t, useLang, type Key } from '../i18n.ts'
import { Field, GhostIcon, run, Sheet, type Ctx } from './common.tsx'

export function Settings(props: { ctx: Ctx; onClose: () => void; flat: boolean; setFlat: (v: boolean) => void; assist: boolean; setAssist: (v: boolean) => void }) {
  const lang = useLang()
  const { ctx } = props
  const { site, ghost } = ctx.project
  const [sign,setSign]=useState(ctx.project.privateHome?.sign??'HOME')
  const [volume,changeVolume]=useState(ambientVolume())
  const [tab,setTab]=useState<'room'|'name'|'boo'|'device'>('room')
  const zh=lang==='zh'
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
      <div class="home-handbook">
        <nav aria-label={zh?'手册书签':'Handbook bookmarks'}>{(['room','name','boo','device'] as const).map((v,i)=><button type="button" aria-pressed={tab===v} onClick={()=>setTab(v)}>{(zh?['房间','门牌','Boo','本机']:['Room','Doorplate','Boo','Device'])[i]}</button>)}</nav>
        <section key={tab}>
        {tab==='room'&&<><h3>{zh?'屋里的光':'Light in the room'}</h3>
        <div class="light-swatches">{(['morning','afternoon','dusk','midnight','auto'] as const).map((v,i)=><button class={'swatch-'+v} aria-pressed={(ctx.project.privateHome?.period??'auto')===v} onClick={()=>run(ctx,p=>({...p,privateHome:{...p.privateHome,period:v},room:{...p.room,light:v==='midnight'?'night':v==='auto'?'auto':'day'}}))}><i aria-hidden="true"/>{(zh?['清晨','午后','黄昏','深夜','随当地时间']:['Morning','Afternoon','Dusk','Midnight','Local time'])[i]}</button>)}</div>
      <form class="light-letter-form" onSubmit={e=>{e.preventDefault();run(ctx,p=>({...p,privateHome:{...p.privateHome,sign:sign.trim()||'HOME'}}),t('settings.saved'))}}>
        <label>{zh?'墙上的灯语':'Words in lights'} <input maxLength={48} value={sign} onInput={e=>setSign(e.currentTarget.value)}/></label>
        <button class="chip">{zh?'挂到墙上':'Hang on wall'}</button>
        <label>{zh?'什么时候亮起':'Light the letters'} <select value={ctx.project.privateHome?.lightTrigger??'enter'} onChange={e=>{const lightTrigger=e.currentTarget.value as 'enter'|'lamps'|'touch';run(ctx,p=>({...p,privateHome:{...p.privateHome,lightTrigger}}))}}>
          <option value="enter">{zh?'回家时':'When I come home'}</option><option value="lamps">{zh?'开灯时':'With the lamps'}</option><option value="touch">{zh?'触碰灯串时':'When touched'}</option></select></label>
      </form><label class="field">{zh?'窗外的虫鸣':'Crickets outside'}<input aria-label={zh?'环境音量':'Room tone volume'} type="range" min="0" max="1" step=".05" value={volume} onInput={e=>{const v=+e.currentTarget.value;changeVolume(v);setAmbientVolume(v);if(v){primeSound();startAmbient()}else stopAmbient()}}/></label>
      <label class="switch-row">
        <input type="checkbox" checked={props.assist} onChange={(e) => props.setAssist(e.currentTarget.checked)} />
        <span>
          {ta('hud.assistAlways')} <span class="muted small">{ta('hud.assistHint')}</span>
        </span>
      </label>
      <label class="switch-row">
        <input type="checkbox" checked={props.flat} onChange={(e) => props.setFlat(e.currentTarget.checked)} />
        <span>
          {t('settings.low')} <span class="muted small">{t('settings.lowHint')}</span>
        </span>
      </label>
</>}
        {tab==='name'&&<>      <div class="card">
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

</>}
        {tab==='boo'&&<>      <h3>{t('settings.petColor')}</h3>
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
</>}
        {tab==='device'&&<>      <h3>{t('settings.language')}</h3>
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

      <h3>{ta('reset.title')}</h3>
      <div class="card card-warn">
        <p class="small">{ta('reset.body')}</p>
        <button
          type="button"
          class="btn btn-danger btn-block"
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
          <Icon name="trash" size={18} /> {ta('reset.button')}
        </button>
      </div>
</>}
        </section></div>
    </Sheet>
  )
}
