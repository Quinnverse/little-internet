import {stopAmbient} from './sfx.ts'
import {TapeShelf} from './TapeShelf.tsx'
import {assetUrl} from './common.tsx'
import {MemoryWall} from './MemoryWall.tsx'
import {ListeningRoom} from './ListeningRoom.tsx'
import {NightWindow} from './NightWindow.tsx'
import {GiftRitual} from './GiftRitual.tsx'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { publicProjection } from '../../core/privacy.ts'
import type { Post, Project } from '../../core/schema.ts'
import type { RoomView } from '../../room3d/view.ts'
import {processPhoto} from '../images.ts'
import {randomId} from '../ids.ts'
import { addAsset,addPost,compose,moveDecor, updateSite, type Command } from '../commands.ts'
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
import { WebAtelier } from './atelier/WebAtelier.tsx'
import { ComputerSheet, DoorSheet, MoveSheet, republish, WalkSheet, type ComputerChoice } from './Neighbourhood.tsx'
import { ta } from '../i18nAtelier.ts'
import { hasKey, savedServer, siteStatus, siteUrl } from '../publish.ts'

import { Sheet } from './common.tsx'
import { PEOPLE_ON, PeopleSheet } from './PeopleSheet.tsx'
import {CameraControl} from './CameraControl.tsx'
import { flushOutbox, inbox as fetchInbox } from '../people.ts'

type Panel =
  | null
  | { kind:'sky'; letter?:{name:string;message:string} }
  | { kind: 'wall'|'records'|'calendar'|'desktop'|'cinema' }
  | { kind: 'entry'; post?: Post }
  | { kind: 'journal'; archive?: import('../../core/archive.ts').PostKind }
  | { kind: 'voice' }
  | { kind: 'pet' }
  | { kind: 'computer' }
  | { kind: 'publishing' }
  | { kind: 'door' }
  | { kind: 'gift' }
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
  useEffect(()=>{const quiet=()=>{if(document.hidden)stopAmbient()};document.addEventListener('visibilitychange',quiet);return ()=>{document.removeEventListener('visibilitychange',quiet);stopAmbient()}},[])
  const { ctx } = props
  const lang = useLang()
  // The room keeps its own clock. It is the cheapest thing that makes a still room feel inhabited,
  // and it means "dusk" is something that happens to you rather than a setting you operate.
  const [clock, setClock] = useState(() => new Date())
  const [quietTitle, setQuietTitle] = useState(false)
  const [showHint, setShowHint] = useState(true)
  const [giftInvite, setGiftInvite] = useState(false)
  const zhUI = lang === 'zh'
  useEffect(() => {
    if (window.location.hash === '#gift') setPanel({ kind: 'gift' })
    const t = window.setTimeout(() => setGiftInvite(true), 16000)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 20000)
    const a = window.setTimeout(() => setQuietTitle(true), 9000)
    const b = window.setTimeout(() => setShowHint(false), 14000)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])
  const [panel, setPanel] = useState<Panel>(null)
  const [previewing, setPreviewing] = useState<false | 'published' | 'draft'>(false)
  const [atelier, setAtelier] = useState(() => typeof location !== 'undefined' && location.hash === '#atelier')
  const [decorating, setDecorating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<RoomView | null>(null)
  const [flat, setFlat] = useState(() => flatPref() || sceneFailed())
  // Quiet by default: names and markers show on hover/focus, or when the owner asks (Hints button or Settings).
  const [assistAlways, setAssistAlways] = useState(assistPref())
  const [inspect,setInspect]=useState(false)
  useEffect(()=>{if(view)view.inspect=inspect && !decorating},[inspect,view,decorating])
  const [immersed,setImmersed]=useState(false)
  const [tour,setTour]=useState(()=>{try{return localStorage.getItem('boo-tour:'+ctx.project.site.slug)?-1:0}catch{return -1}})
  const finishTour=()=>{setTour(-1);try{localStorage.setItem('boo-tour:'+ctx.project.site.slug,'1')}catch{}}
  const [toolsOpen,setToolsOpen]=useState(false)
  const [date,setDate]=useState(''),[occasion,setOccasion]=useState('')
  async function keepRoomPhoto(){
    if(!view)return
    try{
      const blob=await (await fetch(view.capturePhoto(aspect))).blob()
      const asset={id:randomId(),...await processPhoto(new File([blob],'Room.jpg',{type:'image/jpeg'}))}
      run(ctx,compose(addAsset(asset),addPost({id:randomId(),title:lang==='zh'?'我眼里的家':'Home, from here',body:'',kind:'photo',imageIds:[asset.id],createdAt:new Date().toISOString()})),lang==='zh'?'已收入私人相册':'Saved to your private album')
    }catch{ctx.toast(lang==='zh'?'未能保存照片':'Could not save the photo','error')}
  }
  const [aspect,setAspect]=useState(1.5)
  const [peek, setPeek] = useState(false)
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
    view?.returnToRoom()
  }

  const open = (p: Panel, focus?: string) => {
    if (focus){view?.rememberView();view?.focus(focus)}
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
      case 'light-sign':view?.replayLights();return
      case 'diary':
        return open({ kind: 'entry' }, 'diary')
      case 'computer':
        return open({kind:'desktop'},'computer')
      case 'export':
        return open({ kind: 'move' }, 'export')
      case 'voice':
        return open({ kind: 'voice' }, 'voice')
      case 'pet':
        if (unread) return open({kind:'people'}, 'pet')
        return open({ kind: 'pet' }, 'pet')
      case 'shelf':
        // The shelf is where reading notes live; the Journal button opens the whole archive.
        return open({ kind: 'journal', archive: 'reading' }, 'shelf')
      case 'records':case 'wall':case 'calendar':return open({kind:id},id)
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
        return setAtelier(true)
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
      {flatMode ? (
        <FlatHome ctx={ctx} onPick={onPick} />
      ) : (
        <Scene
          data={data}
          hotspots={inspect?[]:PRIMARY_HOTSPOTS}
          decorate={decorating}
          selected={selected}
          onPick={onPick}
          onCell={onCell}
          onView={setView}
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
      {!!unread&&!panel&&!decorating&&!immersed&&<button class="letter-at-door" onClick={()=>onPick('pet')}>✉ {lang==='zh'?'接过 Boo 的信':'Take the letter from Boo'}</button>}
      {tour>=0 && !panel && !immersed && !perceive && <aside class="welcome-tour">
        <strong>{'Boo'}</strong><p>{(lang==='zh'?['我给你留了灯。点一块空地，我们一起走进去。','书桌上有一本空白手账。写下今天想留住的一件小事，也可以只留给自己。','想念朋友时就打开信箱。交换好友码，选一张信纸，写一句话或放一颗爱心。']:['I left the light on. Tap an empty floor tile and walk in with me.','There’s a fresh page on the desk. Write one thing you want to remember. You can keep it private.','Missing someone? Open Letters, exchange friend codes, then send a note or a single heart.'])[tour]}</p>
        <button class="chip" onClick={()=>tour===2?finishTour():setTour(tour+1)}>{tour===2?(lang==='zh'?'开始探索':'Explore'):(lang==='zh'?'继续':'Next')}</button> <button class="chip" onClick={finishTour}>{lang==='zh'?'自己逛逛':'Skip tour'}</button></aside>}
      <header class="hud-top">
        <div class="hud-scrim" aria-hidden="true"/>
        <div class={`home-title${quietTitle ? ' is-quiet' : ''}`} hidden={immersed}>
          <h1>{ctx.project.site.title}</h1>
          {ctx.project.site.tagline && <p>{ctx.project.site.tagline}</p>}
        </div>
        <div class="hud-actions">
          <button class="round" aria-expanded={toolsOpen} aria-label={lang==='zh'?'家园菜单':'Home menu'} onClick={()=>setToolsOpen(!toolsOpen)}>☰</button>
          {toolsOpen&&<><button class="chip" onClick={()=>{setTour(0);setToolsOpen(false)}}>{lang==='zh'?'跟 Boo 逛逛':'Tour with Boo'}</button>
          <button class="chip" onClick={()=>view?.showResident()}>{lang==='zh'?'找到小人':'Find resident'}</button>
          {!flatMode && <button class="chip" aria-pressed={inspect} onClick={()=>setInspect(!inspect)}>{lang==='zh'?'观察家具':'Inspect furniture'}</button>}
          {!flatMode && <button class="chip" onClick={()=>view?.rotateBy(-Math.PI / 4)}>{lang==='zh'?'向左转':'Turn left'}</button>}
          {!flatMode && <button class="chip" onClick={()=>view?.rotateBy(Math.PI / 4)}>{lang==='zh'?'向右转':'Turn right'}</button>}
          <button class="round" aria-label={lang==='zh'?'切换沉浸模式':'Toggle immersive view'} aria-pressed={immersed} onClick={()=>setImmersed(!immersed)}>{immersed?'↩':'⛶'}</button>
          <button class="round" aria-label="Boo perception" aria-pressed={perceive} onClick={()=>setPerceive(!perceive)}><Icon name="eye" size={18}/></button>
          <button type="button" class="round" onClick={toggleLang} aria-label={t('hud.lang')} title={t('hud.lang')}>
            <Icon name="globe" size={18} /><span class="lang-text">{lang === 'en' ? '中文' : 'EN'}</span>
          </button>
        </>}</div>
      </header>

      {showHint && !decorating && !flatMode && <p class="hud-hint">{t('hud.hint')}</p>}

      {!decorating && !immersed && (
        <>
        <div class="hud-clock" aria-label={zhUI ? '屋里现在的时间' : 'Time in the room'}>
          <span class="dial" aria-hidden="true"><i style={{ transform: `rotate(${(shownHour(currentPeriod(ctx)) % 12) * 30 + shownMinute(currentPeriod(ctx)) * 0.5}deg)` }} /></span>
          <b>{shownTime(ctx, clock, lang)}</b>
          <span>{dayPart(currentPeriod(ctx) === 'auto' ? clock.getHours() : PERIOD_HOUR[currentPeriod(ctx) as keyof typeof PERIOD_HOUR], zhUI)}</span>
        </div>
        <nav class="dock" aria-label="Home">
          <button type="button" class="dock-btn dock-write" onClick={() => onPick('diary')} aria-label={t('hud.write')}>
            <Icon name="pen" size={20} /> <span>{t('hud.write')}</span>
          </button>
          <i class="dock-sep" aria-hidden="true" />
          <DockBtn icon="book" label={t('hud.journal')} onClick={() => open({ kind: 'journal' })} text />
          <DockBtn icon="sofa" label={t('hud.decorate')} onClick={startDecorate} text />
          <DockBtn icon="globe" label={zhUI ? '网站' : 'Website'} onClick={() => open({ kind: 'computer' })} text />
          <DockBtn icon="palette" label={zhUI ? '工坊' : 'Atelier'} onClick={() => setAtelier(true)} text />
          <DockBtn icon="mail" label={zhUI ? '信箱' : 'Letters'} onClick={() => open({ kind: 'people' })} badge={unread} text />
          <DockBtn icon="gear" label={t('hud.settings')} onClick={() => open({ kind: 'settings' })} text />
        </nav>
        </>
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
      {panel?.kind === 'door' && <DoorSheet ctx={ctx} onClose={close} onPreview={() => setPreviewing('published')} onAtelier={() => { setPanel(null); setAtelier(true) }} />}
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
      {panel?.kind==='light'&&<Sheet title={lang==='zh'?'窗边':'By the window'} onClose={close}><div class="choice-row">{(['morning','afternoon','dusk','midnight','auto'] as const).map((v,i)=><button onClick={()=>{ctx.apply(p=>({...p,room:{...p.room,light:v==='auto'?'auto':v==='midnight'?'night':'day'},privateHome:{...p.privateHome,period:v}}))}}>{lang==='zh'?['清晨','午后','黄昏','深夜','当地时间'][i]:v}</button>)}<button aria-pressed={ctx.project.privateHome?.lampsOn??true} onClick={()=>ctx.apply(p=>({...p,privateHome:{...p.privateHome,lampsOn:!(p.privateHome?.lampsOn??true)}}))}>{lang==='zh'?'开关灯':'Switch lamps'}</button><button onClick={()=>setPanel({kind:'sky'})}>{lang==='zh'?'去看星星':'Step outside'}</button></div></Sheet>}
      <ListeningRoom ctx={ctx} open={panel?.kind==='records'} close={close} playing={v=>{if(view)view.recordPlaying=v}}/>
      {panel?.kind==='wall'&&<MemoryWall ctx={ctx} close={close} openLetter={letter=>{view?.focus('window');setPanel({kind:'sky',letter})}}/>}
      {panel?.kind==='sky'&&<NightWindow ctx={ctx} close={close} letter={panel.letter}/>}
      {panel?.kind==='gift'&&<GiftRitual ctx={ctx} close={close} lang={lang} onKeep={()=>{ctx.apply(p=>({...p,posts:[{id:randomId(),slug:'a-little-light',title:'A little light',body:'',createdAt:new Date().toISOString(),visibility:'private',imageIds:[],kind:'gift',tags:['gift'],fields:{},starred:false}],privateHome:{...p.privateHome,lampsOn:true}}))}}/>}
      {panel?.kind==='desktop'&&<Sheet title="Little Internet OS" onClose={close}><div class="crt-bezel"><div class="crt-status"><span>Little Internet OS</span><time>{new Date().toLocaleDateString(lang)}</time></div><div class="crt-desktop" style={ctx.project.assets.some(a=>a.id===ctx.project.privateHome?.paper)?{backgroundImage:'url('+assetUrl(ctx.project.assets.find(a=>a.id===ctx.project.privateHome?.paper)!)+')',backgroundSize:'cover'}:{}}>
        <button onClick={()=>{setPanel(null);setPreviewing(ctx.project.web.published?'published':'draft')}}><Icon name="computer"/>{lang==='zh'?'我的网站':'My Website'}</button>
        <button onClick={()=>{setPanel(null);setAtelier(true)}}><Icon name="palette"/>{lang==='zh'?'网站工坊':'Website Atelier'}</button>
        {([['cinema','Movie Collection','录像带','cassette'],['calendar','Calendar','日历','note'],['journal','Memories','记忆','book'],['wall','Photo Album','相册','photo'],['records','Record Shelf','唱片架','shelf'],['sky','Night Window','夜空','moon'],['walk','Internet Neighbors','邻居','link'],['settings','Settings','设置','gear']] as const).map(([kind,label,cn,icon])=><button onClick={()=>setPanel({kind})}><Icon name={icon}/>{lang==='zh'?cn:label}</button>)}</div><div class="crt-hardware" aria-hidden="true"><i/><b/></div></div><label>▧ {lang==='zh'?'桌面壁纸':'Wallpaper'} <select value={ctx.project.privateHome?.paper??''} onChange={e=>{const id=e.currentTarget.value;ctx.apply(p=>({...p,privateHome:{...p.privateHome,paper:id||undefined}}))}}><option value="">—</option>{ctx.project.posts.flatMap(post=>post.imageIds.map((id,i)=><option value={id}>{post.title} · {i+1}</option>))}</select></label></Sheet>}
      {panel?.kind==='cinema'&&<TapeShelf ctx={ctx} close={close}/>}
      {panel?.kind==='calendar'&&<Sheet title={lang==='zh'?'值得记住的日子':'Days worth keeping'} onClose={close}><form onSubmit={e=>{e.preventDefault();const r=ctx.apply(p=>({...p,privateHome:{...p.privateHome,dates:[...(p.privateHome?.dates??[]),{id:'d'+crypto.randomUUID().replaceAll('-','').slice(0,12),day:date,name:occasion.trim()}]}}));if(r.ok)setOccasion('');else ctx.toast(r.reason,'error')}}><input required type="date" value={date} onInput={e=>setDate(e.currentTarget.value)}/><input required maxLength={100} value={occasion} placeholder={lang==='zh'?'这一天有什么特别？':'What is special about this day?'} onInput={e=>setOccasion(e.currentTarget.value)}/><button>＋</button></form>
      {[...(ctx.project.privateHome?.dates??[])].sort((a,b)=>a.day.localeCompare(b.day)).map(d=><p>{d.day} · {d.name} <button onClick={()=>ctx.apply(p=>({...p,privateHome:{...p.privateHome,dates:p.privateHome?.dates?.filter(x=>x.id!==d.id)}}))}>×</button></p>)}</Sheet>}
      {immersed&&view&&<div class="photo-tools"><select aria-label="Photo aspect ratio" value={aspect} onChange={e=>setAspect(+e.currentTarget.value)}><option value="1">1∶1</option><option value="1.5">3∶2</option><option value={16/9}>16∶9</option></select><button onClick={()=>{const a=document.createElement('a');a.download='little-internet-home.jpg';a.href=view.capturePhoto(aspect);a.click()}}>{lang==='zh'?'保存照片':'Download photo'}</button><button onClick={keepRoomPhoto}>{lang==='zh'?'收入相册':'Keep in album'}</button></div>}
      {giftInvite&&!panel&&<button class="gift-invite" onClick={()=>{setGiftInvite(false);setPanel({kind:'gift'})}}><span class="gi-k">a sealed envelope</span><b>{lang==='zh'?'有人在门口留了个东西':'Someone left something at the door'}</b><span class="gi-a">{lang==='zh'?'拆开':'open'} →</span></button>}
      {previewing && <Preview direct onDecorate={()=>{setPreviewing(false);setAtelier(true)}} project={ctx.project} design={previewing} onClose={() => setPreviewing(false)} />}
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

const PERIOD_HOUR = { morning: 7, afternoon: 14, dusk: 18, midnight: 23 } as const

/** If the owner pinned a time of day, the clock agrees with the light. Nothing breaks a room faster
 *  than a "23:40" label over an afternoon-lit floor. */
function currentPeriod(ctx: Ctx) {
  return ctx.project.privateHome?.period ?? 'auto'
}
function shownHour(p: string) {
  return p === 'auto' ? new Date().getHours() : PERIOD_HOUR[p as keyof typeof PERIOD_HOUR] ?? new Date().getHours()
}
function shownMinute(p: string) {
  return p === 'auto' ? new Date().getMinutes() : p === 'midnight' ? 40 : 12
}
function shownTime(ctx: Ctx, clock: Date, lang: string) {
  const p = currentPeriod(ctx)
  const d = p === 'auto' ? clock : new Date(2020, 0, 1, PERIOD_HOUR[p as keyof typeof PERIOD_HOUR] ?? 12, p === 'midnight' ? 40 : 12)
  return d.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** The clock reads as a place, not a timestamp: "21:40 · evening" says more than "21:40". */
function dayPart(h: number, zh: boolean) {
  const zhParts = ['深夜', '深夜', '深夜', '深夜', '深夜', '清晨', '清晨', '清晨', '上午', '上午', '上午', '上午', '正午', '午后', '午后', '午后', '午后', '黄昏', '黄昏', '黄昏', '夜里', '夜里', '夜里', '深夜']
  const enParts = ['late night', 'late night', 'late night', 'late night', 'late night', 'early morning', 'early morning', 'early morning', 'morning', 'morning', 'morning', 'morning', 'noon', 'afternoon', 'afternoon', 'afternoon', 'afternoon', 'dusk', 'dusk', 'dusk', 'evening', 'evening', 'evening', 'late night']
  return zh ? zhParts[Math.min(23, Math.max(0, h))] : enParts[Math.min(23, Math.max(0, h))]
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

/** The same objects as plain cards, for devices without WebGL or when the owner turns 3D off. */
function FlatHome(props: { ctx: Ctx; onPick: (id: string) => void }) {
  const items: [string, IconName][] = [
    ['diary', 'pen'],
    ['computer', 'computer'],
    ['voice', 'phone'],
    ['shelf', 'book'],['wall','book'],['records','phone'],['calendar','book'],
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
            <span>{({wall:'照片墙 · Album',records:'唱片机 · Records',calendar:'日历 · Calendar'})[id]??t(`hot.${id}` as 'hot.diary')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
