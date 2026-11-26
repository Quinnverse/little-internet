import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { publicProjection } from '../../core/privacy.ts'
import type { Post, Project } from '../../core/schema.ts'
import type { RoomView } from '../../room3d/view.ts'
import { moveDecor, updateRoomSkin, updateSite, type Command } from '../commands.ts'
import { getLang, setLang, t, useLang } from '../i18n.ts'
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
import { WebAtelier } from './atelier/WebAtelier.tsx'
import { ComputerSheet, DoorSheet, MoveSheet, republish, WalkSheet, type ComputerChoice } from './Neighbourhood.tsx'
import { ta } from '../i18nAtelier.ts'
import { hasKey, savedServer, siteStatus, siteUrl } from '../publish.ts'
import { LIGHTS } from '../../core/room.ts'
import { Sheet } from './common.tsx'
import { PEOPLE_ON, PeopleSheet } from './PeopleSheet.tsx'
import {CameraControl} from './CameraControl.tsx'
import { LivingClock } from './LivingClock.tsx'
import { BooBubble, type BubbleTone } from './BooBubble.tsx'
import { FirstDay } from './FirstDay.tsx'
import { DailyGoals } from './DailyGoals.tsx'
import { Arrival } from './Arrival.tsx'
import {
  completeGoal,
  completeStep,
  loadOnboarding,
  notedWalk,
  saveOnboarding,
  type DailyGoal,
  type FirstDayStep,
  type Onboarding,
} from '../../core/onboarding.ts'
import { flushOutbox, inbox as fetchInbox } from '../people.ts'

type Panel =
  | null
  | { kind: 'entry'; post?: Post }
  | { kind: 'journal'; archive?: import('../../core/archive.ts').PostKind }
  | { kind: 'voice' }
  | { kind: 'pet' }
  | { kind: 'computer' }
  | { kind: 'publishing' }
  | { kind: 'door' }
  | { kind: 'walk' }
  | { kind: 'move' }
  | { kind: 'settings' }
  | { kind: 'light' }
  | { kind: 'people' }

const ASSIST_KEY = 'li-assist'
const assistPref = () => {
  try {
    return localStorage.getItem(ASSIST_KEY) === '1'
  } catch {
    return false
  }
}
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
  const [previewing, setPreviewing] = useState<false | 'published' | 'draft'>(false)
  const [atelier, setAtelier] = useState(() => typeof location !== 'undefined' && location.hash === '#atelier')
  const [decorating, setDecorating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<RoomView | null>(null)
  const [cameraMode, setCameraMode] = useState<'life' | 'layout'>('life')
  const toggleCameraMode = () => {
    const next = cameraMode === 'life' ? 'layout' : 'life'
    setCameraMode(next)
    view?.setCameraMode(next)
  }
  const [flat, setFlat] = useState(() => flatPref() || sceneFailed())
  // Quiet by default: names and markers show on hover/focus, or when the owner asks (Hints button or Settings).
  const [assistAlways, setAssistAlways] = useState(assistPref())
  const [peek, setPeek] = useState(false)
  // The walking hint greets you once per device, then steps aside like a good host.
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem('li-walk-hint') !== 'done' } catch { return true }
  })

  // ---- First-day journey (device-local, keyed by slug; never stored in the home) ----
  const slug = ctx.project.site.slug
  const [onboarding, setOnboarding] = useState<Onboarding>(() => loadOnboarding(slug))
  const onboardingRef = useRef(onboarding)
  const [arrival, setArrival] = useState(() => !onboarding.introSeen)
  const [booLine, setBooLine] = useState('')
  const [booTone, setBooTone] = useState<BubbleTone>('hint')
  const updateOnboarding = (fn: (o: Onboarding) => Onboarding) => {
    const next = fn(onboardingRef.current)
    onboardingRef.current = next
    setOnboarding(next)
    saveOnboarding(slug, next)
  }
  const sayBoo = (line: string, tone: BubbleTone = 'hint') => {
    setBooTone(tone)
    setBooLine(line)
  }
  const markStep = (step: FirstDayStep) => {
    const wasDone = onboardingRef.current.done.includes(step)
    updateOnboarding((o) => completeStep(o, step))
    if (!wasDone) {
      const praise: Record<FirstDayStep, string> = {
        walk: getLang() === 'zh' ? '你走得很稳！家里每个角落都看看。' : 'Nice walking! Every corner is yours to see.',
        diary: getLang() === 'zh' ? '写下来了。这是只属于你的记录。' : 'You wrote it down. That record is just yours.',
        pet: getLang() === 'zh' ? '有你陪着，真好。' : 'It’s nice having you here.',
        decorate: getLang() === 'zh' ? '家里变样了，我很喜欢。' : 'The place looks different. I like it.',
        website: getLang() === 'zh' ? '你的网站工坊打开了，随心布置吧。' : 'Your website studio is open. Make it yours.',
        publish: getLang() === 'zh' ? '门开了。想来的人可以进来了。' : 'The door is open. People can come in now.',
      }
      sayBoo(praise[step], 'happy')
    }
  }
  const markGoal = (goal: DailyGoal) => updateOnboarding((o) => completeGoal(o, goal))
  const openAtelier = () => { markStep('website'); setAtelier(true) }
  const handleWalk = () => {
    const before = onboardingRef.current
    const after = notedWalk(before)
    onboardingRef.current = after
    setOnboarding(after)
    saveOnboarding(slug, after)
    if (!before.done.includes('walk') && after.done.includes('walk')) markStep('walk')
  }
  // Letters: the server is contacted only after the owner has opened People once on this device.
  const [perceive,setPerceive]=useState(false)
  const [caught,setCaught]=useState(false)
  const [heartLetter,setHeartLetter]=useState(false)
  const [unread, setUnread] = useState(0)
  const lastUnread = useRef<number | null>(null)
  useEffect(() => {
    const slug = ctx.project.site.slug
    let stop = false
    let busy = false
    const tick = async () => {
      if (document.visibilityState !== 'visible' || busy) return
      try { if (localStorage.getItem(PEOPLE_ON) !== '1') return } catch { return }
      busy = true
      try {
        await flushOutbox(slug, savedServer())
        const n = (await fetchInbox(slug, savedServer())).mail.filter((m) => m.unread).length
        if (stop) return
        // Boo reacts only to a letter that really arrived on the server.
        if (n > (lastUnread.current ?? 0)) {
          view?.pet.deliver()
          ctx.toast(ta('mail.arrived'))
        }
        lastUnread.current = n
        setUnread(n)
      } catch {
        /* offline: keep the last known count, no false news */
      } finally { busy = false }
    }
    void tick()
    window.addEventListener('online', tick)
    document.addEventListener('visibilitychange', tick)
    const id = window.setInterval(tick, 25_000)
    return () => {
      stop = true
      window.removeEventListener('online', tick)
      document.removeEventListener('visibilitychange', tick)
      window.clearInterval(id)
    }
  }, [ctx.project.site.slug, view])
  useEffect(() => {
    if (!showHint) return
    const id = window.setTimeout(() => {
      setShowHint(false)
      try { localStorage.setItem('li-walk-hint', 'done') } catch { /* ignore */ }
    }, 9000)
    return () => window.clearTimeout(id)
  }, [showHint])

  // On a brand-new home, open the door and have Boo welcome the owner behind the arrival veil.
  useEffect(() => {
    if (!arrival || !view) return
    view.setDoorOpen(true)
    view.pet.set('greet')
    const id = window.setTimeout(() => view.setDoorOpen(false), 2400)
    return () => window.clearTimeout(id)
  }, [arrival, view])

  const finishArrival = () => {
    setArrival(false)
    updateOnboarding((o) => ({ ...o, introSeen: true }))
    sayBoo(getLang() === 'zh' ? '欢迎回家！我是 Boo。四处走走吧，点地板我就能跟上。' : 'Welcome home! I’m Boo. Walk around — tap the floor and I’ll follow.', 'greet')
  }
  // Detect first-day steps from real product state — never fake completion.
  const prevPostCount = useRef(ctx.project.posts.length)
  const prevDecorCount = useRef(ctx.project.room.decor.length)
  const prevPublished = useRef(!!ctx.project.web.published)
  useEffect(() => {
    const p = ctx.project
    if (p.posts.length > prevPostCount.current) {
      markStep('diary')
      markGoal('write')
    }
    prevPostCount.current = p.posts.length
    if (p.room.decor.length > prevDecorCount.current) markStep('decorate')
    prevDecorCount.current = p.room.decor.length
    if (p.web.published && !prevPublished.current) {
      markStep('publish')
      markGoal('neighbour')
    }
    prevPublished.current = !!p.web.published
  }, [ctx.project])

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
    if (!peek) return
    const id = window.setTimeout(() => setPeek(false), 6000)
    return () => window.clearTimeout(id)
  }, [peek])

  const close = () => {
    setPanel(null)
    view?.resetView()
  }

  const open = (p: Panel, focus?: string) => {
    if (p && p.kind === 'people') markGoal('mail')
    if (focus) view?.focus(focus)
    // Boo walks over to keep you company where you are working.
    const spot = focus && ({ diary: 'desk', computer: 'desk', voice: 'desk', shelf: 'shelf', window: 'window', door: 'door' } as Record<string, 'desk' | 'shelf' | 'window' | 'door'>)[focus]
    if (spot) view?.pet.attend(spot, 12)
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
      case 'export':
        return open({ kind: 'move' }, 'export')
      case 'voice':
        return open({ kind: 'voice' }, 'voice')
      case 'pet':
        markStep('pet')
        markGoal('company')
        view?.pet.respond('happy')
        if (unread) return open({kind:'people'}, 'pet')
        return open({ kind: 'pet' }, 'pet')
      case 'shelf':
        // The shelf is where reading notes live; the Journal button opens the whole archive.
        return open({ kind: 'journal', archive: 'reading' }, 'shelf')
      case 'window':
        return open({ kind: 'light' })
      case 'door':
        view?.setDoorOpen(true)
        window.setTimeout(() => view?.setDoorOpen(false), 900)
        return open({ kind: 'door' }, 'door')
    }
  }

  const onComputer = async (c: ComputerChoice) => {
    switch (c) {
      case 'decorate':
        setPanel(null)
        return openAtelier()
      case 'walk':
        return setPanel({ kind: 'walk' })
      case 'move':
        return setPanel({ kind: 'move' })
      case 'publish':
        return setPanel({ kind: 'publishing' })
      case 'visit': {
        const slug = ctx.project.site.slug
        const live = ctx.project.web.published ? await siteStatus(slug, savedServer()).catch(() => null) : null
        if (live?.open) window.open(siteUrl(slug, savedServer()), '_blank', 'noopener')
        else setPreviewing(ctx.project.web.published ? 'published' : 'draft')
      }
    }
  }

  // Privacy sync (Task A): when what visitors may see changes (an entry made private, a keepsake
  // removed, a recording hidden…) and this browser published the site, publish the same design
  // again so the live website, RSS, room and search data follow at once.
  const publicSig = useMemo(() => {
    const pub = publicProjection(ctx.project)
    return JSON.stringify({ ...pub, web: null, assets: pub.assets.map((a) => [a.id, a.data.byteLength]), recordings: pub.recordings.map((r) => [r.id, r.title, r.openOn]) })
  }, [ctx.project])
  const lastSig = useRef(publicSig)
  useEffect(() => {
    if (publicSig === lastSig.current) return
    if (!ctx.project.web.published) {
      lastSig.current = publicSig
      return
    }
    const id = window.setTimeout(async () => {
      lastSig.current = publicSig
      const slug = ctx.project.site.slug
      if (!(await hasKey(slug))) return
      const st = await siteStatus(slug, savedServer()).catch(() => null)
      if (!st?.open) return
      try {
        await republish(ctx, ctx.project, savedServer())
        ctx.toast(ta('sync.done'))
      } catch (e) {
        ctx.toast(ta('sync.fail', { why: (e as Error).message }), 'error')
      }
    }, 1200)
    return () => window.clearTimeout(id)
  }, [publicSig])

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
    view?.pet.set('react') // Boo is pleased with the new look
    setDecorating(false)
    setSelected(null)
    history.current = []
    setUndoable(0)
  }

  const flatMode = flat || !!(view === null && sceneFailed())

  return (
    <div class={`home${assistAlways || peek ? ' assist' : ''}${decorating ? ' is-decorating' : ''}`}>
      {arrival && <Arrival onDone={finishArrival} />}
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
          onWalk={handleWalk}
        />
      )}

      {perceive&&!panel&&!decorating&&<div class="home-perception">
        <CameraControl mode="boo" immersive softwareRenderer={!!view?.softwareRenderer} hint="Boo" onFace={cue=>view?.pet.faceCue(cue)} onAction={action=>{
          if(action.kind==='cursor')view?.pet.follow(action.x,action.y)
          if(action.kind==='boo'){view?.pet.respond(action.reaction);if(action.reaction==='catch-heart')setCaught(true)}
        }}/>
        {!caught && view && <button class="btn btn-small" onClick={()=>{
          view.pet.respond('catch-heart')
          setCaught(true)
        }}>♡ {lang==='zh'?'递给 Boo 一颗心':'Give Boo a heart'}</button>}
        {caught&&<button class="btn" onClick={()=>{setCaught(false);setHeartLetter(true);open({kind:'people'})}}>♥ {lang==='zh'?'写一封爱心信':'Make a heart letter'}</button>}
      </div>}
      <header class="hud-top">
        <div class="home-title">
          <h1>{ctx.project.site.title}</h1>
          {ctx.project.site.tagline && <p>{ctx.project.site.tagline}</p>}
          <LivingClock />
        </div>
        <div class="hud-actions">
          <button type="button" class="round wide" onClick={toggleCameraMode}
            aria-label={cameraMode === 'life' ? (lang === 'zh' ? '切换到布置视角' : 'Switch to layout view') : (lang === 'zh' ? '切换到生活视角' : 'Switch to life view')}
            title={cameraMode === 'life' ? (lang === 'zh' ? '布置视角' : 'Layout view') : (lang === 'zh' ? '生活视角' : 'Life view')}>
            <Icon name={cameraMode === 'life' ? 'home' : 'sofa'} size={17} />
            <span class="cam-mode-text">{cameraMode === 'life' ? (lang === 'zh' ? '生活' : 'Life') : (lang === 'zh' ? '布置' : 'Layout')}</span>
          </button>
          <button class="round" aria-label="Boo perception" aria-pressed={perceive} onClick={()=>setPerceive(!perceive)}><Icon name="eye" size={18}/></button>
          <button type="button" class="round" onClick={toggleLang} aria-label={t('hud.lang')} title={t('hud.lang')}>
            <Icon name="globe" size={18} /><span class="lang-text">{lang === 'en' ? '中文' : 'EN'}</span>
          </button>
          <button type="button" class="round" onClick={() => open({ kind: 'settings' })} aria-label={t('hud.settings')} title={t('hud.settings')}>
            <Icon name="gear" size={20} />
          </button>
        </div>
      </header>

      {!arrival && !decorating && !atelier && !panel && !onboarding.dismissed && (
        <FirstDay onboarding={onboarding} onHide={() => updateOnboarding((o) => ({ ...o, dismissed: true }))} />
      )}
      {!arrival && !decorating && !atelier && !panel && (
        <DailyGoals onboarding={onboarding} />
      )}
      {!arrival && booLine && !panel && (
        <BooBubble line={booLine} tone={booTone} onDone={() => setBooLine('')} />
      )}

      {!decorating && !flatMode && showHint && !arrival && <p class="hud-hint">{t('hud.hint')}</p>}

      {!decorating && (
        <nav class="dock" aria-label="Home">
          {!flatMode && (
            <>
              <DockBtn icon="eye" label={ta('hud.hints')} onClick={() => setPeek((v) => !v)} />
          <DockBtn icon="rotl" label={t('hud.rotateL')} onClick={() => view?.rotateBy(-Math.PI / 4)} />
              <DockBtn icon="rotr" label={t('hud.rotateR')} onClick={() => view?.rotateBy(Math.PI / 4)} />
            </>
          )}
          <button type="button" class="dock-main" onClick={() => onPick('diary')}>
            <Icon name="pen" size={20} /> <span>{t('hud.write')}</span>
          </button>
          <DockBtn icon="book" label={t('hud.journal')} onClick={() => open({ kind: 'journal' })} text />
          <DockBtn icon="sofa" label={t('hud.decorate')} onClick={startDecorate} text />
          <DockBtn icon="palette" label={ta('crt.decorate')} onClick={openAtelier} />
          <DockBtn icon="mail" label={ta('mail.dock')} onClick={() => open({ kind: 'people' })} badge={unread} />
        </nav>
      )}

      {decorating && <Decorate ctx={ctx} apply={applyDeco} undo={undo} undoable={undoable} selected={selected} setSelected={setSelected} onDone={endDecorate} />}

      {panel?.kind === 'entry' && <EntrySheet ctx={ctx} post={panel.post} onClose={close} />}
      {panel?.kind === 'journal' && (
        <Journal ctx={ctx} onClose={close} {...(panel.archive ? { initialKind: panel.archive } : {})} />
      )}
      {panel?.kind === 'voice' && <VoiceSheet ctx={ctx} onClose={close} />}
      {panel?.kind === 'pet' && (
        <OwnerGhost
          ctx={ctx}
          onClose={close}
          onWrite={() => view?.pet.attend('desk', 15)}
          onReact={(r) => {
            // Gestures only make Boo react. They never change or send anything.
            view?.pet.set(r === 'greet' ? 'greet' : 'react')
            if (r === 'come') view?.pet.nudge()
          }}
          onDecorate={() => {
            setPanel(null)
            startDecorate()
          }}
        />
      )}
      {panel?.kind === 'computer' && <ComputerSheet onClose={close} onChoose={onComputer} />}
      {panel?.kind === 'publishing' && <Website ctx={ctx} onClose={close} onPreview={() => setPreviewing('published')} />}
      {panel?.kind === 'door' && <DoorSheet ctx={ctx} onClose={close} onPreview={() => setPreviewing('published')} onAtelier={() => { setPanel(null); openAtelier() }} />}
      {panel?.kind === 'walk' && <WalkSheet ctx={ctx} onClose={close} />}
      {panel?.kind === 'move' && <MoveSheet ctx={ctx} onClose={close} />}
      {panel?.kind === 'settings' && (
        <Settings
          ctx={ctx}
          onClose={close}
          assist={assistAlways}
          setAssist={(v) => {
            setAssistAlways(v)
            try {
              localStorage.setItem(ASSIST_KEY, v ? '1' : '0')
            } catch {
              /* ignore */
            }
          }}
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
      {panel?.kind === 'people' && <PeopleSheet ctx={ctx} heartDraft={heartLetter} onClose={()=>{setHeartLetter(false);close()}} onUnread={setUnread} />}
      {panel?.kind === 'light' && <LightSheet ctx={ctx} onClose={close} />}
      {previewing && <Preview project={ctx.project} design={previewing} onClose={() => setPreviewing(false)} />}
      {atelier && (
        <WebAtelier
          ctx={ctx}
          onClose={() => {
            setAtelier(false)
            if (location.hash === '#atelier') window.history.replaceState(null, '', location.pathname + location.search)
          }}
        />
      )}
    </div>
  )
}

function DockBtn(props: { icon: IconName; label: string; onClick: () => void; text?: boolean; badge?: number }) {
  return (
    <button type="button" class={`dock-btn${props.text ? ' dock-text' : ''}`} onClick={props.onClick} aria-label={props.label} title={props.label}>
      <Icon name={props.icon} size={20} />
      {props.text && <span>{props.label}</span>}
      {!!props.badge && <span class="badge-count" aria-label={ta('mail.unread', { n: props.badge })}>{props.badge}</span>}
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
