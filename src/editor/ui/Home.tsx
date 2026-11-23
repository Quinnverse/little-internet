import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Post, Project } from '../../core/schema.ts'
import type { RoomView } from '../../room3d/view.ts'
import { moveDecor, updateRoomSkin, updateSite, type Command } from '../commands.ts'
import { setLang, t, useLang } from '../i18n.ts'
import { run, type Ctx } from './common.tsx'
import { Decorate } from './Decorate.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { Icon, type IconName } from './icons.tsx'
import { Journal } from './Journal.tsx'
import { OwnerGhost } from './OwnerGhost.tsx'
import { Preview } from './Preview.tsx'
import { PRIMARY_HOTSPOTS, Scene, sceneFailed, toHomeData } from './Scene.tsx'
import { Settings } from './Settings.tsx'
import { VoiceSheet } from './VoiceSheet.tsx'
import { Website } from './Website.tsx'
import { LIGHTS } from '../../core/room.ts'
import { Sheet } from './common.tsx'

type Panel =
  | null
  | { kind: 'entry'; post?: Post }
  | { kind: 'journal' }
  | { kind: 'voice' }
  | { kind: 'pet' }
  | { kind: 'computer' }
  | { kind: 'settings' }
  | { kind: 'light' }

const FLAT_KEY = 'li-flat'
const flatPref = () => {
  try {
    return localStorage.getItem(FLAT_KEY) === '1'
  } catch {
    return false
  }
}

export function Home(props: { ctx: Ctx }) {
  const { ctx } = props
  const lang = useLang()
  const [panel, setPanel] = useState<Panel>(null)
  const [previewing, setPreviewing] = useState(false)
  const [decorating, setDecorating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<RoomView | null>(null)
  const [flat, setFlat] = useState(flatPref() || sceneFailed())
  const [labels, setLabels] = useState(true)
  const data = useMemo(() => toHomeData(ctx.project), [ctx.project])
  const history = useRef<Project[]>([])
  const [undoable, setUndoable] = useState(0)

  /** Runs a decorate command and remembers the previous project so it can be undone. */
  const applyDeco = (cmd: Command): boolean => {
    const before = ctx.project
    const r = ctx.apply(cmd)
    if (!r.ok) {
      ctx.toast(r.reason, 'error')
      return false
    }
    history.current.push(before)
    if (history.current.length > 30) history.current.shift()
    setUndoable(history.current.length)
    return true
  }
  const undo = () => {
    const prev = history.current.pop()
    setUndoable(history.current.length)
    if (prev) ctx.replace(prev)
  }
  const onCell = (x: number, z: number) => {
    if (!selected?.startsWith('decor:')) return
    applyDeco(moveDecor(selected.slice(6), x, z))
  }

  useEffect(() => {
    const id = window.setTimeout(() => setLabels(false), 7000)
    return () => window.clearTimeout(id)
  }, [])

  const close = () => {
    setPanel(null)
    view?.resetView()
  }

  const open = (p: Panel, focus?: string) => {
    if (focus) view?.focus(focus)
    setPanel(p)
  }

  const onPick = (id: string) => {
    view?.pet.nudge()
    if (decorating) {
      if (id.startsWith('decor:') || id.startsWith('memory:')) setSelected(id === selected ? null : id)
      return
    }
    if (id.startsWith('memory:')) {
      const m = ctx.project.room.memory.find((x) => x.id === id.slice(7))
      const post = m && ctx.project.posts.find((x) => x.id === m.postId)
      if (post) open({ kind: 'entry', post }, id)
      return
    }
    switch (id) {
      case 'diary':
        return open({ kind: 'entry' }, 'diary')
      case 'computer':
        return open({ kind: 'computer' }, 'computer')
      case 'voice':
        return open({ kind: 'voice' }, 'voice')
      case 'pet':
        return open({ kind: 'pet' }, 'pet')
      case 'shelf':
        return open({ kind: 'journal' }, 'shelf')
      case 'window':
        return open({ kind: 'light' })
      case 'door':
        view?.setDoorOpen(true)
        window.setTimeout(() => {
          setPreviewing(true)
          view?.setDoorOpen(false)
        }, 450)
    }
  }

  const toggleLang = () => {
    const next = lang === 'en' ? 'zh' : 'en'
    setLang(next)
    run(ctx, updateSite({ lang: next }))
  }

  const startDecorate = () => {
    setPanel(null)
    view?.resetView()
    setDecorating(true)
  }

  const endDecorate = () => {
    setDecorating(false)
    setSelected(null)
    history.current = []
    setUndoable(0)
  }

  const flatMode = flat || !!(view === null && sceneFailed())

  return (
    <div class={`home${labels ? ' show-labels' : ''}${decorating ? ' is-decorating' : ''}`}>
      {flatMode ? (
        <FlatHome ctx={ctx} onPick={onPick} />
      ) : (
        <Scene
          data={data}
          hotspots={PRIMARY_HOTSPOTS}
          decorate={decorating}
          selected={selected}
          onPick={onPick}
          onCell={onCell}
          onView={setView}
        />
      )}

      <header class="hud-top">
        <div class="home-title">
          <h1>{ctx.project.site.title}</h1>
          {ctx.project.site.tagline && <p>{ctx.project.site.tagline}</p>}
        </div>
        <div class="hud-actions">
          <button type="button" class="round" onClick={toggleLang} aria-label={t('hud.lang')} title={t('hud.lang')}>
            <span class="lang-text">{lang === 'en' ? '中' : 'EN'}</span>
          </button>
          <button type="button" class="round" onClick={() => open({ kind: 'settings' })} aria-label={t('hud.settings')} title={t('hud.settings')}>
            <Icon name="gear" size={20} />
          </button>
        </div>
      </header>

      {!decorating && !flatMode && <p class="hud-hint">{t('hud.hint')}</p>}

      {!decorating && (
        <nav class="dock" aria-label="Home">
          {!flatMode && (
            <>
              <DockBtn icon="rotl" label={t('hud.rotateL')} onClick={() => view?.rotateBy(-Math.PI / 4)} />
              <DockBtn icon="rotr" label={t('hud.rotateR')} onClick={() => view?.rotateBy(Math.PI / 4)} />
            </>
          )}
          <button type="button" class="dock-main" onClick={() => onPick('diary')}>
            <Icon name="pen" size={20} /> <span>{t('hud.write')}</span>
          </button>
          <DockBtn icon="book" label={t('hud.journal')} onClick={() => open({ kind: 'journal' })} text />
          <DockBtn icon="sofa" label={t('hud.decorate')} onClick={startDecorate} text />
        </nav>
      )}

      {decorating && <Decorate ctx={ctx} apply={applyDeco} undo={undo} undoable={undoable} selected={selected} setSelected={setSelected} onDone={endDecorate} />}

      {panel?.kind === 'entry' && <EntrySheet ctx={ctx} post={panel.post} onClose={close} />}
      {panel?.kind === 'journal' && (
        <Journal ctx={ctx} onClose={close} />
      )}
      {panel?.kind === 'voice' && <VoiceSheet ctx={ctx} onClose={close} />}
      {panel?.kind === 'pet' && <OwnerGhost ctx={ctx} onClose={close} />}
      {panel?.kind === 'computer' && <Website ctx={ctx} onClose={close} onPreview={() => setPreviewing(true)} />}
      {panel?.kind === 'settings' && (
        <Settings
          ctx={ctx}
          onClose={close}
          flat={flat}
          setFlat={(v) => {
            setFlat(v)
            try {
              localStorage.setItem(FLAT_KEY, v ? '1' : '0')
            } catch {
              /* ignore */
            }
          }}
        />
      )}
      {panel?.kind === 'light' && <LightSheet ctx={ctx} onClose={close} />}
      {previewing && <Preview project={ctx.project} onClose={() => setPreviewing(false)} />}
    </div>
  )
}

function DockBtn(props: { icon: IconName; label: string; onClick: () => void; text?: boolean }) {
  return (
    <button type="button" class={`dock-btn${props.text ? ' dock-text' : ''}`} onClick={props.onClick} aria-label={props.label} title={props.label}>
      <Icon name={props.icon} size={20} />
      {props.text && <span>{props.label}</span>}
    </button>
  )
}

function LightSheet(props: { ctx: Ctx; onClose: () => void }) {
  const { ctx } = props
  const cur = ctx.project.room.light
  const icon: Record<(typeof LIGHTS)[number], IconName> = { auto: 'reset', day: 'sun', night: 'moon' }
  return (
    <Sheet title={t('light.title')} onClose={props.onClose}>
      <p class="muted small">{t('light.hint')}</p>
      <div class="choice-row">
        {LIGHTS.map((l) => (
          <button
            type="button"
            key={l}
            class={`chip ${cur === l ? 'selected' : ''}`}
            aria-pressed={cur === l}
            onClick={() => run(ctx, updateRoomSkin({ light: l }))}
          >
            <Icon name={icon[l]} size={18} /> {t(`light.${l}`)}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** The same objects as plain cards, for devices without WebGL or when the owner turns 3D off. */
function FlatHome(props: { ctx: Ctx; onPick: (id: string) => void }) {
  const items: [string, IconName][] = [
    ['diary', 'pen'],
    ['computer', 'computer'],
    ['voice', 'phone'],
    ['shelf', 'book'],
    ['pet', 'ghost'],
    ['window', 'sun'],
    ['door', 'door'],
  ]
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div class="flat" ref={ref}>
      <p class="muted">{t('hud.flatHint')}</p>
      <div class="flat-grid">
        {items.map(([id, icon]) => (
          <button type="button" key={id} class="flat-card" onClick={() => props.onPick(id)}>
            <Icon name={icon} size={28} />
            <span>{t(`hot.${id}` as 'hot.diary')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
