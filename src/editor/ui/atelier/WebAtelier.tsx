import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  BORDERS,
  DIVIDERS,
  FONTS,
  LOOKS,
  pageWidgets,
  PAGE_SLUG_PATTERN,
  PATTERNS,
  STICKERS,
  STYLES,
  STARTER_TOKENS,
  type DecorationAsset,
  type SiteDesign,
  type SiteWidget,
  type StyleId,
  type WidgetContent,
  type WidgetType,
} from '../../../core/design.ts'
import * as D from '../../../core/designOps.ts'
import { spriteSvg } from '../../../core/pixels.ts'
import { publicProjection } from '../../../core/privacy.ts'
import type { Project } from '../../../core/schema.ts'
import { addAsset, collectGarbage, compose, design, publishDraft, revertDraft, setDraft, setGuestbookSnapshot, updateSite } from '../../commands.ts'
import { t, useLang } from '../../i18n.ts'
import { ta } from '../../i18nAtelier.ts'
import { randomId } from '../../ids.ts'
import { pickImageFile, processDecoration, type DecorationUse } from '../../images.ts'
import { approvedNotes, publishSite, savedServer, siteUrl } from '../../publish.ts'
import { assetUrl, Field, formatDate, type Ctx } from '../common.tsx'
import { Icon, type IconName } from '../icons.tsx'
import { Preview } from '../Preview.tsx'
import { BadgeEditor } from './BadgeEditor.tsx'
import { ColorPick, OptionalColor, Range, Section, Seg, Select } from './controls.tsx'
import { lbl } from './labels.ts'
import { PreviewFrame } from './PreviewFrame.tsx'

type Tab = 'add' | 'style' | 'pages' | 'edit' | 'site'

const GROUPS: { key: string; types: WidgetType[] }[] = [
  { key: 'at.groupBasics', types: ['welcome', 'about', 'text', 'image', 'divider'] },
  { key: 'at.groupLife', types: ['diary', 'gallery', 'bookshelf', 'memories', 'audio', 'boo'] },
  { key: 'at.groupNeighbours', types: ['guestbook', 'links', 'webring', 'button'] },
  { key: 'at.groupDeco', types: ['sticker', 'construction'] },
]

const TYPE_ICON: Record<WidgetType, IconName> = {
  welcome: 'home',
  about: 'edit',
  diary: 'book',
  gallery: 'photo',
  bookshelf: 'shelf',
  memories: 'shell',
  audio: 'phone',
  boo: 'ghost',
  guestbook: 'mail',
  links: 'link',
  webring: 'globe',
  button: 'badge',
  text: 'note',
  image: 'photo',
  sticker: 'flower',
  divider: 'list',
  construction: 'stop',
}

const typeName = (type: WidgetType) => ta(`wt.${type}`)

function widgetLabel(w: SiteWidget): string {
  const c = w.content
  const h = 'heading' in c && c.heading ? c.heading : ''
  return h ? `${typeName(c.type)} · ${h}` : typeName(c.type)
}

type History = { undo: SiteDesign[]; redo: SiteDesign[]; key: string | null; at: number }

/** Web Atelier: the owner's visual website editor (component library, live preview, inspector). */
export function WebAtelier(props: { ctx: Ctx; onClose: () => void }) {
  useLang()
  const { ctx } = props
  const p = ctx.project
  const d = p.web.draft
  const contentLang = p.site.lang
  const [pageId, setPageId] = useState(d.pages[0]!.id)
  const page = d.pages.find((x) => x.id === pageId) ?? d.pages[0]!
  const [selected, setSelected] = useState<string | null>(null)
  const sel = selected ? d.widgets.find((w) => w.id === selected) : undefined
  const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches
  const [isNarrow, setIsNarrow] = useState(narrow())
  const [tab, setTab] = useState<Tab>('add')
  const [drawer, setDrawer] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'phone'>(typeof window !== 'undefined' && window.innerWidth < 600 ? 'phone' : 'desktop')
  const [badge, setBadge] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [visitor, setVisitor] = useState(false)
  const hist = useRef<History>({ undo: [], redo: [], key: null, at: 0 })
  const [, bump] = useState(0)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const on = () => setIsNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => {
    if (!d.pages.some((x) => x.id === pageId)) setPageId(d.pages[0]!.id)
    if (selected && !d.widgets.some((w) => w.id === selected)) setSelected(null)
  }, [d])

  /** Runs a design op on the draft; `key` merges quick successive edits of one field into one undo step. */
  const apply = (op: D.DesignOp, key?: string): boolean => {
    const before = ctx.project.web.draft
    const r = ctx.apply(design(op))
    if (!r.ok) {
      ctx.toast(r.reason, 'error')
      return false
    }
    const h = hist.current
    const now = Date.now()
    if (!(key && h.key === key && now - h.at < 1200)) {
      h.undo.push(before)
      if (h.undo.length > 80) h.undo.shift()
    }
    h.key = key ?? null
    h.at = now
    h.redo = []
    bump((n) => n + 1)
    return true
  }

  const undo = () => {
    const h = hist.current
    const prev = h.undo.pop()
    if (!prev) return
    const r = ctx.apply(setDraft(prev))
    if (r.ok) h.redo.push(d)
    else ctx.toast(r.reason, 'error')
    h.key = null
    bump((n) => n + 1)
  }
  const redo = () => {
    const h = hist.current
    const next = h.redo.pop()
    if (!next) return
    const r = ctx.apply(setDraft(next))
    if (r.ok) h.undo.push(d)
    else ctx.toast(r.reason, 'error')
    h.key = null
    bump((n) => n + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input,textarea,select')
      if (!(e.ctrlKey || e.metaKey) || typing) return
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const close = () => {
    // Uploads that ended up unused are dropped when the owner leaves the Atelier.
    ctx.apply(collectGarbage)
    props.onClose()
  }

  const select = (id: string | null) => {
    setSelected(id)
    if (id) {
      setTab('edit')
      if (isNarrow) setDrawer(true)
    }
  }

  const addType = (type: WidgetType) => {
    const id = randomId()
    const list = pageWidgets(d, page.id)
    const after = sel && sel.pageId === page.id ? list.findIndex((w) => w.id === sel.id) + 1 : list.length
    if (apply(D.addWidget(id, page.id, type, contentLang, after))) {
      ctx.toast(ta('at.added', { name: typeName(type) }))
      select(id)
    }
  }

  /** Uploads an image for the website and returns its decoration id. */
  const upload = async (use: DecorationUse, kind: DecorationAsset['kind']): Promise<string | null> => {
    const file = await pickImageFile()
    if (!file) return null
    try {
      const img = await processDecoration(file, use)
      const id = randomId()
      const r = ctx.apply(compose(addAsset({ id, mime: img.mime, data: img.data }), design(D.addDecoration({ id, kind, name: file.name.slice(0, 60) || kind }))))
      if (!r.ok) {
        ctx.toast(r.reason, 'error')
        return null
      }
      return id
    } catch (e) {
      ctx.toast((e as Error).message, 'error')
      return null
    }
  }

  const published = p.web.published
  const dirty = !published || JSON.stringify(published.design) !== JSON.stringify(d)
  const status = !published ? ta('at.neverPublished') : dirty ? ta('at.unpublished') : ta('at.upToDate')
  const labels = useMemo(() => Object.fromEntries(d.widgets.map((w) => [w.id, widgetLabel(w)])), [d.widgets])

  const tabs: [Tab, IconName, string][] = [
    ['add', 'plus', ta('at.tabAdd')],
    ['style', 'palette', ta('at.tabStyle')],
    ['pages', 'layers', ta('at.tabPages')],
    ['edit', 'edit', ta('at.tabEdit')],
    ['site', 'gear', ta('at.tabSite')],
  ]

  const panel = (which: Tab) => {
    switch (which) {
      case 'add':
        return <AddPanel onAdd={addType} />
      case 'style':
        return <StylePanel ctx={ctx} d={d} apply={apply} pageId={page.id} upload={upload} />
      case 'pages':
        return <PagesPanel d={d} apply={apply} pageId={page.id} setPageId={setPageId} selected={selected} onSelect={select} />
      case 'edit':
        return sel ? (
          <Inspector ctx={ctx} w={sel} d={d} apply={apply} upload={upload} onBadge={() => setBadge(true)} onDeselect={() => setSelected(null)} />
        ) : (
          <div class="at-empty">
            <p class="muted">{ta('at.tapToEdit')}</p>
            <PagesOutline d={d} pageId={page.id} selected={selected} onSelect={select} apply={apply} />
          </div>
        )
      case 'site':
        return <SitePanel ctx={ctx} d={d} apply={apply} upload={upload} onBadge={() => setBadge(true)} />
    }
  }

  const [left, setLeft] = useState<Tab>('add')
  useEffect(() => {
    if (tab === 'add' || tab === 'style' || tab === 'pages') setLeft(tab)
  }, [tab])

  return (
    <div class={`atelier${isNarrow ? ' is-narrow' : ''}`} role="dialog" aria-modal="true" aria-label={ta('at.title')}>
      <header class="at-bar">
        <button type="button" class="btn btn-small" onClick={close} aria-label={ta('at.back')}>
          <Icon name="home" size={18} /> <span class="hide-sm">{ta('at.back')}</span>
        </button>
        <h1 class="at-title hide-sm">{ta('at.title')}</h1>

        <select class="at-page" aria-label={ta('pg.pages')} value={page.id} onChange={(e) => setPageId(e.currentTarget.value)}>
          {d.pages.map((x, i) => (
            <option key={x.id} value={x.id}>{i === 0 ? `${x.title || ta('pg.home')} ⌂` : x.title || x.slug}</option>
          ))}
        </select>
        <div class="at-bar-group">
          <button type="button" class="icon-btn" onClick={undo} disabled={!hist.current.undo.length} aria-label={ta('at.undo')} title={ta('at.undo')}><Icon name="undo" /></button>
          <button type="button" class="icon-btn" onClick={redo} disabled={!hist.current.redo.length} aria-label={ta('at.redo')} title={ta('at.redo')}><Icon name="redo" /></button>
        </div>
        <div class="seg at-device-toggle" role="group" aria-label={`${ta('at.desktop')} / ${ta('at.phone')}`}>
          <button type="button" class={device === 'desktop' ? 'on' : ''} aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} title={ta('at.desktop')} aria-label={ta('at.desktop')}><Icon name="computer" size={18} /><span class="hide-sm"> {ta('at.desktop')}</span></button>
          <button type="button" class={device === 'phone' ? 'on' : ''} aria-pressed={device === 'phone'} onClick={() => setDevice('phone')} title={ta('at.phone')} aria-label={ta('at.phone')}><Icon name="mobile" size={18} /><span class="hide-sm"> {ta('at.phone')}</span></button>
        </div>
        <span class={`at-status${dirty ? ' dirty' : ''} hide-sm`} role="status">{status}</span>
        <button type="button" class="btn btn-small hide-sm" onClick={() => ctx.toast(ta('at.saved'))} aria-label={ta('at.saveDraft')}>
          <Icon name="check" size={16} /> {ta('at.saveDraft')}
        </button>
        <button type="button" class="btn btn-small" onClick={() => setVisitor(true)} title={ta('at.visitorView')} aria-label={ta('at.visitorView')}>
          <Icon name="eye" size={16} /><span class="hide-sm"> {ta('at.visitorView')}</span>
        </button>
        <button type="button" class="btn btn-small btn-primary" onClick={() => setPublishing(true)}>
          <Icon name="cloud" size={16} /> {ta('at.publish')}
        </button>
      </header>

      <div class="at-body">
        {!isNarrow && (
          <aside class="at-left" aria-label={ta('at.tabAdd')}>
            <div class="at-tabs" role="tablist">
              {tabs.slice(0, 3).map(([k, icon, label]) => (
                <button type="button" role="tab" key={k} aria-selected={left === k} class={left === k ? 'on' : ''} onClick={() => setLeft(k)}>
                  <Icon name={icon} size={16} /> {label}
                </button>
              ))}
            </div>
            <div class="at-scroll">{panel(left)}</div>
          </aside>
        )}

        <main class="at-center">
          <button class="chip" aria-pressed={!!page.free} onClick={()=>apply(D.updatePage(page.id,{free:!page.free}))}>{p.site.lang==='zh'?(page.free?'自由画布':'响应式网格'):(page.free?'Free canvas':'Responsive grid')}</button>
          <PreviewFrame project={p} pageId={page.id} selected={selected} labels={labels} device={device} title={ta('at.previewLabel')} onAdjust={(id,dx,dy,resize,colWidth)=>{
            const w=d.widgets.find(item=>item.id===id)
            if(!w)return
            if(page.free){
              const delta=dx*100/(colWidth*page.columns),clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n))
              apply(prev=>({...prev,widgets:prev.widgets.map(item=>{
                if(item.pageId!==page.id || (item.id!==id && (resize||!w.layout.group||item.layout.group!==w.layout.group)))return item
                const l=item.layout,idx=pageWidgets(prev,page.id).findIndex(x=>x.id===item.id)
                return {...item,layout:{...l,...(resize?{widthPct:clamp((l.widthPct??48)+delta,8,100),heightPx:clamp((l.heightPx??220)+dy,60,1800)}:{canvasX:clamp((l.canvasX??0)+delta,0,92),canvasY:clamp((l.canvasY??idx*180)+dy,0,5000)})}}
              })}));return
            }
            const limit=(n:number)=>Math.max(-80,Math.min(80,Math.round(n)))
            apply(D.setWidgetLayout(id,resize?{span:Math.min(page.columns,Math.max(1,w.layout.span+Math.round(dx/colWidth)))}:{offsetX:limit((w.layout.offsetX??0)+dx),offsetY:limit((w.layout.offsetY??0)+dy)}))
          }} onSelect={select} />
          <p class="at-note muted small">{ta('at.onlyPublic')}</p>
        </main>

        {!isNarrow && (
          <aside class="at-right" aria-label={ta('at.tabEdit')}>
            <div class="at-tabs" role="tablist">
              {tabs.slice(3).map(([k, icon, label]) => (
                <button type="button" role="tab" key={k} aria-selected={(tab === 'site' ? 'site' : 'edit') === k} class={(tab === 'site' ? 'site' : 'edit') === k ? 'on' : ''} onClick={() => setTab(k)}>
                  <Icon name={icon} size={16} /> {label}
                </button>
              ))}
            </div>
            <div class="at-scroll">{panel(tab === 'site' ? 'site' : 'edit')}</div>
          </aside>
        )}
      </div>

      {isNarrow && (
        <div class={`at-drawer${drawer ? ' open' : ''}`}>
          {drawer && (
            <div class="at-drawer-panel">
              <div class="at-drawer-head">
                <strong>{tabs.find(([k]) => k === tab)?.[2]}</strong>
                <span class={`at-status${dirty ? ' dirty' : ''}`}>{status}</span>
                <button type="button" class="icon-btn" aria-label={t('common.close')} onClick={() => setDrawer(false)}><Icon name="down" /></button>
              </div>
              <div class="at-scroll">{panel(tab)}</div>
            </div>
          )}
          <nav class="at-drawer-tabs" role="tablist" aria-label={ta('at.title')}>
            {tabs.map(([k, icon, label]) => (
              <button
                type="button"
                role="tab"
                key={k}
                aria-selected={drawer && tab === k}
                class={drawer && tab === k ? 'on' : ''}
                onClick={() => {
                  if (drawer && tab === k) setDrawer(false)
                  else {
                    setTab(k)
                    setDrawer(true)
                  }
                }}
              >
                <Icon name={icon} size={20} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      {badge && <BadgeEditor ctx={ctx} onClose={() => setBadge(false)} />}
      {publishing && <PublishDialog ctx={ctx} onClose={() => setPublishing(false)} />}
      {visitor && <Preview project={p} design="draft" onClose={() => setVisitor(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------- add

function AddPanel(props: { onAdd: (t: WidgetType) => void }) {
  return (
    <div class="at-add">
      {GROUPS.map((g) => (
        <Section title={ta(g.key)} key={g.key}>
          <div class="lib-grid">
            {g.types.map((type) => (
              <button type="button" key={type} class="lib-item" onClick={() => props.onAdd(type)}>
                <Icon name={TYPE_ICON[type]} size={22} />
                <span>{typeName(type)}</span>
              </button>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------- style

type Apply = (op: D.DesignOp, key?: string) => boolean
type Upload = (use: DecorationUse, kind: DecorationAsset['kind']) => Promise<string | null>

function StylePanel(props: { ctx: Ctx; d: SiteDesign; apply: Apply; pageId: string; upload: Upload }) {
  const { d, apply } = props
  const tk = d.tokens
  const set = (patch: Parameters<typeof D.setTokens>[0], key: string) => apply(D.setTokens(patch), `tok:${key}`)
  const [pending, setPending] = useState<StyleId | null>(null)
  const fontOpts = FONTS.map((f) => [f, lbl(`font.${f}`)] as const)

  const useStyle = (style: StyleId, keepWidgets: boolean) => {
    const base = randomId()
    apply(D.applyStyle(style, { keepWidgets, pageId: props.pageId, lang: props.ctx.project.site.lang, newId: (i) => `${base.slice(0, 8)}${i}` }))
    setPending(null)
  }

  return (
    <div>
      <Section title={ta('st.starter')}>
        <div class="style-pick">
          {STYLES.map((s) => (
            <button type="button" key={s} class={`style-swatch sw-${s}${d.style === s ? ' selected' : ''}`} onClick={() => setPending(s)} aria-pressed={d.style === s}>
              <span class="sw-art" aria-hidden="true" />
              <span class="sw-name">{ta(`style.${s}`)}</span>
            </button>
          ))}
        </div>
        {pending && (
          <div class="card at-confirm">
            <p>{ta('st.applyConfirm', { name: ta(`style.${pending}`) })}</p>
            <p class="muted small">{ta(`style.${pending}.d`)}</p>
            <div class="choice-row">
              <button type="button" class="btn btn-primary btn-small" onClick={() => useStyle(pending, true)}>{ta('st.restyle')}</button>
              <button type="button" class="btn btn-small" onClick={() => useStyle(pending, false)}>{ta('st.replace')}</button>
              <button type="button" class="btn btn-small" onClick={() => setPending(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}
      </Section>

      <Section title={ta('st.background')}>
        <ColorPick label={ta('st.bgColor')} value={tk.bg} onChange={(v) => set({ bg: v }, 'bg')} />
        <div class="pattern-grid" role="group" aria-label={ta('st.pattern')}>
          {PATTERNS.map((pt) => (
            <button type="button" key={pt} class={`pattern-chip pc-${pt}${tk.pattern === pt ? ' on' : ''}`} aria-pressed={tk.pattern === pt} onClick={() => set({ pattern: pt }, 'pattern')}>
              <span>{lbl(`pat.${pt}`)}</span>
            </button>
          ))}
        </div>
        {tk.pattern !== 'none' && <ColorPick label={ta('st.patternColor')} value={tk.patternColor} onChange={(v) => set({ patternColor: v }, 'patternColor')} />}
        <div class="field">
          <span class="field-label">{ta('st.bgImage')}</span>
          <div class="choice-row">
            <button
              type="button"
              class="btn btn-small"
              onClick={async () => {
                const id = await props.upload('background', 'background')
                if (id) set({ bgAssetId: id }, 'bgimg')
              }}
            >
              <Icon name="upload" size={16} /> {ta('ed.upload')}
            </button>
            {tk.bgAssetId && <button type="button" class="btn btn-small btn-danger" onClick={() => set({ bgAssetId: null }, 'bgimg')}>{ta('ed.removeImage')}</button>}
          </div>
        </div>
        {tk.bgAssetId && <Seg label={ta('st.bgImage')} value={tk.bgFit} options={[['tile', ta('st.tile')], ['cover', ta('st.cover')]]} onChange={(v) => set({ bgFit: v }, 'fit')} />}
      </Section>

      <Section title={ta('st.type')}>
        <Select label={ta('st.headingFont')} value={tk.headingFont} options={fontOpts} onChange={(v) => set({ headingFont: v }, 'hf')} />
        <Select label={ta('st.bodyFont')} value={tk.bodyFont} options={fontOpts} onChange={(v) => set({ bodyFont: v }, 'bf')} />
        <Range label={ta('st.size')} value={tk.baseSize} min={13} max={20} unit="px" onChange={(v) => set({ baseSize: v }, 'size')} />
        <Range label={ta('st.titleSize')} value={tk.titleSize} min={18} max={64} unit="px" onChange={(v) => set({ titleSize: v }, 'tsize')} />
      </Section>

      <Section title={ta('st.colors')}>
        <ColorPick label={ta('st.text')} value={tk.text} onChange={(v) => set({ text: v }, 'text')} />
        <ColorPick label={ta('st.muted')} value={tk.muted} onChange={(v) => set({ muted: v }, 'muted')} />
        <ColorPick label={ta('st.link')} value={tk.link} onChange={(v) => set({ link: v }, 'link')} />
        <ColorPick label={ta('st.accent')} value={tk.accent} onChange={(v) => set({ accent: v }, 'accent')} />
      </Section>

      <Section title={ta('st.panels')}>
        <Select label={ta('st.look')} value={tk.look} options={LOOKS.map((l) => [l, ta(`look.${l}`)] as const)} onChange={(v) => set({ look: v }, 'look')} />
        <ColorPick label={ta('st.panel')} value={tk.panel} onChange={(v) => set({ panel: v }, 'panel')} />
        <ColorPick label={ta('st.panelText')} value={tk.panelText} onChange={(v) => set({ panelText: v }, 'panelText')} />
        <Select label={ta('st.border')} value={tk.border} options={BORDERS.map((b) => [b, lbl(`border.${b}`)] as const)} onChange={(v) => set({ border: v, borderWidth: v === 'none' ? 0 : Math.max(1, tk.borderWidth) }, 'border')} />
        {tk.border !== 'none' && (
          <>
            <ColorPick label={ta('st.borderColor')} value={tk.borderColor} onChange={(v) => set({ borderColor: v }, 'bc')} />
            <Range label={ta('st.borderWidth')} value={tk.borderWidth} min={1} max={8} unit="px" onChange={(v) => set({ borderWidth: v }, 'bw')} />
          </>
        )}
        <Range label={ta('st.radius')} value={tk.radius} min={0} max={24} unit="px" onChange={(v) => set({ radius: v }, 'radius')} />
        <Seg label={ta('st.shadow')} value={tk.shadow} options={[['none', ta('st.none')], ['soft', ta('st.soft')], ['hard', ta('st.hard')]]} onChange={(v) => set({ shadow: v }, 'shadow')} />
        <Select label={ta('st.divider')} value={tk.divider} options={DIVIDERS.map((x) => [x, lbl(`div.${x}`)] as const)} onChange={(v) => set({ divider: v }, 'divider')} />
      </Section>

      <Section title={ta('st.page')}>
        <Seg label={ta('st.pageWidth')} value={tk.width} options={[['narrow', ta('st.narrow')], ['normal', ta('st.normal')], ['wide', ta('st.wide')]]} onChange={(v) => set({ width: v }, 'width')} />
        <Seg label={ta('st.headerAlign')} value={tk.headerAlign} options={[['left', ta('st.left')], ['center', ta('st.center')]]} onChange={(v) => set({ headerAlign: v }, 'ha')} />
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------------------- pages and outline

function PagesPanel(props: { d: SiteDesign; apply: Apply; pageId: string; setPageId: (id: string) => void; selected: string | null; onSelect: (id: string | null) => void }) {
  const { d, apply } = props
  const addPage = () => {
    const id = randomId()
    let n = d.pages.length
    let slug = `page-${n}`
    while (d.pages.some((x) => x.slug === slug)) slug = `page-${++n}`
    if (apply(D.addPage({ id, slug, title: ta('pg.newTitle'), nav: true, columns: 2 }))) props.setPageId(id)
  }
  return (
    <div>
      <Section title={ta('pg.pages')}>
        <ul class="page-list">
          {d.pages.map((pg, i) => (
            <li key={pg.id} class={pg.id === props.pageId ? 'on' : ''}>
              <button type="button" class="page-pick" onClick={() => props.setPageId(pg.id)} aria-pressed={pg.id === props.pageId}>
                <Icon name={i === 0 ? 'home' : 'pages'} size={16} /> {pg.title || pg.slug}
              </button>
              {i > 0 && (
                <>
                  <button type="button" class="icon-btn" disabled={i <= 1} aria-label={ta('ed.moveUp')} onClick={() => apply(D.movePage(pg.id, -1))}><Icon name="up" size={18} /></button>
                  <button type="button" class="icon-btn" disabled={i === d.pages.length - 1} aria-label={ta('ed.moveDown')} onClick={() => apply(D.movePage(pg.id, 1))}><Icon name="down" size={18} /></button>
                </>
              )}
            </li>
          ))}
        </ul>
        <button type="button" class="btn btn-small" onClick={addPage} disabled={d.pages.length >= 8}><Icon name="plus" size={16} /> {ta('pg.add')}</button>
      </Section>
      <PageSettings d={d} apply={apply} pageId={props.pageId} onRemoved={() => props.setPageId(d.pages[0]!.id)} />
      <Section title={ta('pg.outline')}>
        <PagesOutline d={d} pageId={props.pageId} selected={props.selected} onSelect={props.onSelect} apply={apply} />
      </Section>
    </div>
  )
}

function PageSettings(props: { d: SiteDesign; apply: Apply; pageId: string; onRemoved: () => void }) {
  const { d, apply } = props
  const pg = d.pages.find((x) => x.id === props.pageId)!
  const isHome = d.pages[0]!.id === pg.id
  const [slug, setSlug] = useState(pg.slug)
  useEffect(() => setSlug(pg.slug), [pg.id])
  return (
    <div class="card">
      <Field label={ta('pg.title')}>
        <input value={pg.title} maxLength={40} onInput={(e) => apply(D.updatePage(pg.id, { title: e.currentTarget.value }), `pg:${pg.id}:t`)} />
      </Field>
      {!isHome && (
        <Field label={ta('pg.address')} hint={PAGE_SLUG_PATTERN.test(slug) ? `pages/${slug}.html` : ta('pg.badAddress')}>
          <input
            value={slug}
            maxLength={24}
            autocapitalize="off"
            spellcheck={false}
            aria-invalid={!PAGE_SLUG_PATTERN.test(slug)}
            onInput={(e) => {
              const v = e.currentTarget.value.toLowerCase()
              setSlug(v)
              if (PAGE_SLUG_PATTERN.test(v) && v !== 'index') apply(D.updatePage(pg.id, { slug: v }), `pg:${pg.id}:s`)
            }}
          />
        </Field>
      )}
      <Seg label={ta('pg.columns')} value={pg.columns} options={[[1, '1'], [2, '2'], [3, '3'], [4, '4']]} onChange={(v) => apply(D.updatePage(pg.id, { columns: v }))} />
      <label class="switch-row">
        <input type="checkbox" checked={pg.nav} onChange={(e) => apply(D.updatePage(pg.id, { nav: e.currentTarget.checked }))} />
        <span>{ta('pg.inNav')}</span>
      </label>
      {!isHome && (
        <button
          type="button"
          class="btn btn-small btn-danger"
          onClick={() => {
            if (confirm(ta('pg.removeConfirm', { name: pg.title || pg.slug })) && apply(D.removePage(pg.id))) props.onRemoved()
          }}
        >
          <Icon name="trash" size={16} /> {ta('pg.remove')}
        </button>
      )}
    </div>
  )
}

/** Components on a page, in order. Drag the handle (mouse or touch) or use the arrows to reorder. */
function PagesOutline(props: { d: SiteDesign; pageId: string; selected: string | null; onSelect: (id: string | null) => void; apply: Apply }) {
  const list = pageWidgets(props.d, props.pageId)
  const ul = useRef<HTMLUListElement>(null)
  const [drag, setDrag] = useState<{ id: string; from: number; dy: number; over: number; y0: number } | null>(null)

  const overIndex = (clientY: number, from: number): number => {
    const items = [...(ul.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [])]
    let over = from
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const mid = r.top + r.height / 2
      if (i < from && clientY < mid) over = Math.min(over, i)
      if (i > from && clientY > mid) over = Math.max(over, i)
    })
    return over
  }

  if (list.length === 0) return <p class="muted">{ta('pg.empty')}</p>
  return (
    <>
      <p class="muted small">{ta('ed.dragHint')}</p>
      <ul class="outline" ref={ul}>
        {list.map((w, i) => {
          const dragging = drag?.id === w.id
          const shift = drag && !dragging ? (i > drag.from && i <= drag.over ? -1 : i < drag.from && i >= drag.over ? 1 : 0) : 0
          return (
            <li
              key={w.id}
              class={`${props.selected === w.id ? 'on' : ''}${dragging ? ' dragging' : ''}${w.hidden ? ' is-hidden' : ''}`}
              style={dragging ? { transform: `translateY(${drag!.dy}px)` } : shift ? { transform: `translateY(${shift * 100}%)` } : undefined}
            >
              <span
                class="grip"
                role="button"
                tabIndex={0}
                aria-label={`${ta('ed.dragHint')} ${widgetLabel(w)}`}
                onPointerDown={(e) => {
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  setDrag({ id: w.id, from: i, dy: 0, over: i, y0: e.clientY })
                }}
                onPointerMove={(e) => {
                  if (!drag || drag.id !== w.id) return
                  setDrag({ ...drag, dy: e.clientY - drag.y0, over: overIndex(e.clientY, drag.from) })
                }}
                onPointerUp={() => {
                  if (drag && drag.over !== drag.from) props.apply(D.moveWidget(drag.id, drag.over))
                  setDrag(null)
                }}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') props.apply(D.moveWidget(w.id, i - 1))
                  if (e.key === 'ArrowDown') props.apply(D.moveWidget(w.id, i + 1))
                }}
              >
                <Icon name="grip" size={18} />
              </span>
              <button type="button" class="outline-name" onClick={() => props.onSelect(w.id)}>
                <Icon name={TYPE_ICON[w.content.type]} size={16} /> {widgetLabel(w)}
                {w.hidden && <span class="badge badge-private"><Icon name="lock" size={12} /></span>}
              </button>
              <button type="button" class="icon-btn" disabled={i === 0} aria-label={ta('ed.moveUp')} onClick={() => props.apply(D.moveWidget(w.id, i - 1))}><Icon name="up" size={18} /></button>
              <button type="button" class="icon-btn" disabled={i === list.length - 1} aria-label={ta('ed.moveDown')} onClick={() => props.apply(D.moveWidget(w.id, i + 1))}><Icon name="down" size={18} /></button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// ---------------------------------------------------------------------------- inspector

function Inspector(props: { ctx: Ctx; w: SiteWidget; d: SiteDesign; apply: Apply; upload: Upload; onBadge: () => void; onDeselect: () => void }) {
  const { w, d, apply, ctx } = props
  const list = pageWidgets(d, w.pageId)
  const i = list.findIndex((x) => x.id === w.id)
  const c = w.content
  const setC = (next: WidgetContent, key: string) => apply(D.setWidgetContent(w.id, next), `c:${w.id}:${key}`)
  const pub = publicProjection(ctx.project, 'draft')
  const pageCols = d.pages.find((x) => x.id === w.pageId)?.columns ?? 4

  return (
    <div class="inspector">
      <div class="insp-head">
        <h3><Icon name={TYPE_ICON[c.type]} size={18} /> {typeName(c.type)}</h3>
        <div class="choice-row">
          <button type="button" class="icon-btn" disabled={i <= 0} aria-label={ta('ed.moveUp')} title={ta('ed.moveUp')} onClick={() => apply(D.moveWidget(w.id, i - 1))}><Icon name="up" /></button>
          <button type="button" class="icon-btn" disabled={i >= list.length - 1} aria-label={ta('ed.moveDown')} title={ta('ed.moveDown')} onClick={() => apply(D.moveWidget(w.id, i + 1))}><Icon name="down" /></button>
          <button type="button" class="icon-btn" aria-label={ta('ed.duplicate')} title={ta('ed.duplicate')} onClick={() => apply(D.duplicateWidget(w.id, randomId()))}><Icon name="copy" /></button>
          <button type="button" class="icon-btn" aria-label={w.hidden ? ta('ed.showW') : ta('ed.hideW')} title={w.hidden ? ta('ed.showW') : ta('ed.hideW')} aria-pressed={w.hidden} onClick={() => apply(D.setWidgetHidden(w.id, !w.hidden))}><Icon name={w.hidden ? 'lock' : 'eye'} /></button>
          <button type="button" class="icon-btn" aria-label={t('common.close')} onClick={props.onDeselect}><Icon name="close" /></button>
        </div>
      </div>
      {w.hidden && <p class="badge badge-private">{ta('ed.hiddenNote')}</p>}

      <Section title={ta('ed.text')}>
        {'heading' in c && (
          <Field label={ta('ed.heading')}>
            <input value={c.heading} maxLength={80} onInput={(e) => setC({ ...c, heading: e.currentTarget.value }, 'h')} />
          </Field>
        )}
        <ContentFields {...props} setC={setC} pub={pub} />
      </Section>

      <Section title={ta('ed.layout')}>
        {d.pages.find(pg=>pg.id===w.pageId)?.free&&<>
          <Range label="↻" value={w.layout.angle??0} min={-180} max={180} onChange={v=>apply(D.setWidgetLayout(w.id,{angle:v}))}/>
          <Field label={props.ctx.project.site.lang==='zh'?'群组名（同组一起移动）':'Group name (move together)'}><input maxLength={30} value={w.layout.group??''} onChange={e=>apply(D.setWidgetLayout(w.id,{group:e.currentTarget.value}))}/></Field>
          <button onClick={()=>apply(D.setWidgetLayout(w.id,{canvasX:(100-(w.layout.widthPct??48))/2}))}>↔ {props.ctx.project.site.lang==='zh'?'居中':'Center'}</button></>}
        <Range label={props.ctx.project.site.lang==='zh'?'桌面图层':'Desktop layer'} value={w.layout.layer??0} min={0} max={20} onChange={v=>apply(D.setWidgetLayout(w.id,{layer:v}))}/>
        <Range label={props.ctx.project.site.lang==='zh'?'垂直偏移':'Vertical offset'} value={w.layout.offsetY??0} min={-80} max={80} onChange={v=>apply(D.setWidgetLayout(w.id,{offsetY:v}))}/>
        <Seg label={ta('ed.width')} value={Math.min(w.layout.span, pageCols)} options={([1, 2, 3, 4] as const).filter((n) => n <= pageCols).map((n) => [n, n === pageCols ? ta('ed.full') : `${n}/${pageCols}`] as const)} onChange={(v) => apply(D.setWidgetLayout(w.id, { span: v }))} />
        <Seg label={ta('ed.onPhone')} value={w.layout.mobile} options={[['full', ta('ed.full')], ['half', ta('ed.half')], ['hide', ta('ed.hide')]]} onChange={(v) => apply(D.setWidgetLayout(w.id, { mobile: v }))} />
        <Seg label={ta('ed.onDesktop')} value={w.layout.desktop} options={[['show', ta('ed.show')], ['hide', ta('ed.hide')]]} onChange={(v) => apply(D.setWidgetLayout(w.id, { desktop: v }))} />
        <Seg label={ta('ed.align')} value={w.layout.align} options={[['left', ta('st.left')], ['center', ta('st.center')], ['right', ta('st.right')]]} onChange={(v) => apply(D.setWidgetLayout(w.id, { align: v }))} />
        {d.pages.length > 1 && (
          <Select
            label={ta('ed.movePage')}
            value={w.pageId}
            options={d.pages.map((pg) => [pg.id, pg.title || pg.slug] as const)}
            onChange={(v) => apply(D.moveWidgetToPage(w.id, v))}
          />
        )}
      </Section>

      <Section title={ta('ed.look')}>
        <Select label={ta('ed.look')} value={w.style.look} options={[['auto', ta('ed.auto')], ...LOOKS.map((l) => [l, ta(`look.${l}`)] as const)]} onChange={(v) => apply(D.setWidgetStyle(w.id, { look: v }))} />
        <OptionalColor label={ta('ed.bg')} customLabel={ta('ed.custom')} value={w.style.bg} fallback={d.tokens.panel} onChange={(v) => apply(D.setWidgetStyle(w.id, { bg: v }), `s:${w.id}:bg`)} />
        <OptionalColor label={ta('ed.fg')} customLabel={ta('ed.custom')} value={w.style.fg} fallback={d.tokens.panelText} onChange={(v) => apply(D.setWidgetStyle(w.id, { fg: v }), `s:${w.id}:fg`)} />
        <Range label={ta('ed.tilt')} value={w.style.tilt} min={-3} max={3} onChange={(v) => apply(D.setWidgetStyle(w.id, { tilt: v }), `s:${w.id}:tilt`)} />
      </Section>

      <div class="card card-warn">
        <button
          type="button"
          class="btn btn-danger btn-block"
          onClick={() => {
            if (apply(D.removeWidget(w.id))) {
              ctx.toast(ta('at.removed', { name: typeName(c.type) }))
              props.onDeselect()
            }
          }}
        >
          <Icon name="trash" size={18} /> {ta('ed.delete')}
        </button>
        <p class="muted small">{ta('ed.deleteNote')}</p>
      </div>
    </div>
  )
}

function ImagePick(props: { ctx: Ctx; assetId: string | undefined; upload: Upload; use: DecorationUse; kind: DecorationAsset['kind']; onChange: (id: string | undefined) => void }) {
  const a = props.assetId ? props.ctx.project.assets.find((x) => x.id === props.assetId) : undefined
  const [busy, setBusy] = useState(false)
  return (
    <div class="field">
      {a && <img class="insp-thumb" src={assetUrl(a)} alt="" />}
      <div class="choice-row">
        <button
          type="button"
          class="btn btn-small"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const id = await props.upload(props.use, props.kind)
            setBusy(false)
            if (id) props.onChange(id)
          }}
        >
          <Icon name="upload" size={16} /> {busy ? ta('ed.uploading') : ta('ed.upload')}
        </button>
        {a && <button type="button" class="btn btn-small btn-danger" onClick={() => props.onChange(undefined)}>{ta('ed.removeImage')}</button>}
      </div>
    </div>
  )
}

function ContentFields(props: { ctx: Ctx; w: SiteWidget; d: SiteDesign; apply: Apply; upload: Upload; onBadge: () => void; setC: (c: WidgetContent, key: string) => boolean; pub: Project }) {
  const { w, setC, ctx, pub } = props
  const c = w.content
  const without = <T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> => {
    const { [k]: _x, ...rest } = o
    return rest
  }
  switch (c.type) {
    case 'welcome':
    case 'text':
      return (
        <Field label={ta('ed.text')}>
          <textarea rows={5} value={c.text} maxLength={c.type === 'welcome' ? 600 : 2000} onInput={(e) => setC({ ...c, text: e.currentTarget.value }, 't')} />
        </Field>
      )
    case 'about':
      return (
        <>
          <Field label={ta('ed.text')}>
            <textarea rows={5} value={c.text} maxLength={1200} onInput={(e) => setC({ ...c, text: e.currentTarget.value }, 't')} />
          </Field>
          <span class="field-label">{ta('ed.photo')}</span>
          <ImagePick ctx={ctx} assetId={c.assetId} upload={props.upload} use="image" kind="image" onChange={(id) => setC(id ? { ...c, assetId: id } : without(c, 'assetId'), 'img')} />
        </>
      )
    case 'diary': {
      const publicPosts = pub.posts
      return (
        <>
          <Seg label={ta('ed.mode')} value={c.mode} options={[['latest', ta('ed.latest')], ['pick', ta('ed.pick')]]} onChange={(v) => setC({ ...c, mode: v }, 'mode')} />
          {c.mode === 'latest' && <Range label={ta('ed.count')} value={c.count} min={1} max={12} onChange={(v) => setC({ ...c, count: v }, 'count')} />}
          {c.mode === 'pick' && (
            <div class="pick-list">
              {publicPosts.length === 0 && <p class="muted small">{ta('ed.noPublic')}</p>}
              {publicPosts.map((post) => (
                <label class="switch-row" key={post.id}>
                  <input
                    type="checkbox"
                    checked={c.postIds.includes(post.id)}
                    onChange={(e) =>
                      setC({ ...c, postIds: e.currentTarget.checked ? [...c.postIds, post.id].slice(0, 20) : c.postIds.filter((x) => x !== post.id) }, `pick`)
                    }
                  />
                  <span>{post.title || formatDate(post.createdAt)} <span class="muted small">{formatDate(post.createdAt)}</span></span>
                </label>
              ))}
            </div>
          )}
          {c.mode === 'latest' && publicPosts.length === 0 && <p class="muted small">{ta('ed.noPublic')}</p>}
          <label class="switch-row">
            <input type="checkbox" checked={c.excerpts} onChange={(e) => setC({ ...c, excerpts: e.currentTarget.checked }, 'ex')} />
            <span>{ta('ed.excerpts')}</span>
          </label>
        </>
      )
    }
    case 'gallery': {
      const uploads = props.d.assets.filter((a) => a.kind === 'image' || a.kind === 'sticker')
      return (
        <>
          <Seg label={ta('ed.source')} value={c.source} options={[['posts', ta('ed.fromPosts')], ['uploads', ta('ed.fromUploads')]]} onChange={(v) => setC({ ...c, source: v }, 'src')} />
          <Range label={ta('ed.count')} value={c.count} min={1} max={24} onChange={(v) => setC({ ...c, count: v }, 'count')} />
          {c.source === 'uploads' && (
            <>
              <div class="thumb-grid">
                {uploads.map((dec) => {
                  const a = ctx.project.assets.find((x) => x.id === dec.id)
                  if (!a) return null
                  const on = c.assetIds.includes(dec.id)
                  return (
                    <button type="button" key={dec.id} class={`thumb${on ? ' on' : ''}`} aria-pressed={on} aria-label={dec.name} onClick={() => setC({ ...c, assetIds: on ? c.assetIds.filter((x) => x !== dec.id) : [...c.assetIds, dec.id].slice(0, 24) }, 'pick')}>
                      <img src={assetUrl(a)} alt="" />
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                class="btn btn-small"
                onClick={async () => {
                  const id = await props.upload('image', 'image')
                  if (id) setC({ ...c, assetIds: [...c.assetIds, id].slice(0, 24) }, 'add')
                }}
              >
                <Icon name="upload" size={16} /> {ta('ed.upload')}
              </button>
            </>
          )}
          {c.source === 'posts' && pub.posts.every((x) => x.imageIds.length === 0) && <p class="muted small">{ta('ed.noPublic')}</p>}
        </>
      )
    }
    case 'bookshelf':
      return (
        <div class="books-edit">
          {c.books.map((b, n) => (
            <div class="card book-row" key={b.id}>
              <Field label={ta('ed.bookTitle')}>
                <input value={b.title} maxLength={120} onInput={(e) => setC({ ...c, books: c.books.map((x, j) => (j === n ? { ...x, title: e.currentTarget.value } : x)) }, `b${b.id}t`)} />
              </Field>
              <Field label={ta('ed.bookAuthor')}>
                <input value={b.author} maxLength={80} onInput={(e) => setC({ ...c, books: c.books.map((x, j) => (j === n ? { ...x, author: e.currentTarget.value } : x)) }, `b${b.id}a`)} />
              </Field>
              <Field label={ta('ed.bookNote')}>
                <input value={b.note} maxLength={200} onInput={(e) => setC({ ...c, books: c.books.map((x, j) => (j === n ? { ...x, note: e.currentTarget.value } : x)) }, `b${b.id}n`)} />
              </Field>
              <button type="button" class="btn btn-small btn-danger" onClick={() => setC({ ...c, books: c.books.filter((_, j) => j !== n) }, 'del')}><Icon name="trash" size={16} /></button>
            </div>
          ))}
          <button type="button" class="btn btn-small" disabled={c.books.length >= 40} onClick={() => setC({ ...c, books: [...c.books, { id: randomId(), title: '', author: '', note: '' }] }, 'addbook')}>
            <Icon name="plus" size={16} /> {ta('ed.addBook')}
          </button>
        </div>
      )
    case 'memories':
      return <p class="muted small">{ta('ed.memoriesNote')}</p>
    case 'audio': {
      const has = pub.recordings.length > 0
      return (
        <>
          <Field label={ta('ed.text')}>
            <input value={c.text} maxLength={200} onInput={(e) => setC({ ...c, text: e.currentTarget.value }, 't')} />
          </Field>
          <p class="muted small">{has ? ta('ed.audioNote') : ta('ed.audioNone')}</p>
        </>
      )
    }
    case 'boo':
      return <p class="muted small">{ta('ed.booNote')}</p>
    case 'guestbook':
      return (
        <>
          <Field label={ta('ed.gbIntro')}>
            <input value={c.intro} maxLength={200} onInput={(e) => setC({ ...c, intro: e.currentTarget.value }, 'i')} />
          </Field>
          <label class="switch-row">
            <input type="checkbox" checked={c.open} onChange={(e) => setC({ ...c, open: e.currentTarget.checked }, 'open')} />
            <span>{ta('ed.gbOpen')}</span>
          </label>
          <p class="muted small">{ta('ed.gbNote')}</p>
        </>
      )
    case 'links':
      return (
        <>
          <Seg label={ta('ed.linksLook')} value={c.look} options={[['list', ta('ed.list')], ['buttons', ta('ed.buttons')]]} onChange={(v) => setC({ ...c, look: v }, 'look')} />
          <p class="muted small">{ta('ed.linksNote')}</p>
        </>
      )
    case 'webring':
      return <p class="muted small">{ta('ed.ringNote')}</p>
    case 'button':
      return (
        <>
          <p class="muted small">{ta('ed.buttonNote')}</p>
          <button type="button" class="btn btn-small" onClick={props.onBadge}><Icon name="badge" size={16} /> {ta('ed.editBadge')}</button>
        </>
      )
    case 'image':
      return (
        <>
          <ImagePick ctx={ctx} assetId={c.assetId} upload={props.upload} use="image" kind="image" onChange={(id) => setC(id ? { ...c, assetId: id } : without(c, 'assetId'), 'img')} />
          <Field label={ta('ed.caption')}>
            <input value={c.caption} maxLength={200} onInput={(e) => setC({ ...c, caption: e.currentTarget.value }, 'cap')} />
          </Field>
          <LinkField value={c.href} onChange={(href) => setC(href ? { ...c, href } : without(c, 'href'), 'href')} />
        </>
      )
    case 'sticker':
      return (
        <>
          <div class="sticker-grid" role="group" aria-label={ta('ed.sticker')}>
            {STICKERS.map((s) => (
              <button
                type="button"
                key={s}
                class={`sticker-btn${!c.assetId && c.sticker === s ? ' on' : ''}`}
                aria-pressed={!c.assetId && c.sticker === s}
                aria-label={lbl(`stk.${s}`)}
                title={lbl(`stk.${s}`)}
                onClick={() => setC({ ...without(c, 'assetId'), sticker: s }, 'stk')}
                // Fixed, generated pixel-art markup (no user data).
                dangerouslySetInnerHTML={{ __html: spriteSvg(s) }}
              />
            ))}
          </div>
          <span class="field-label">{ta('ed.upload')}</span>
          <ImagePick ctx={ctx} assetId={c.assetId} upload={props.upload} use="sticker" kind="sticker" onChange={(id) => setC(id ? { ...c, assetId: id } : without(c, 'assetId'), 'img')} />
          <Seg label={ta('ed.size')} value={c.size} options={(['s', 'm', 'l'] as const).map((x) => [x, lbl(`size.${x}`)] as const)} onChange={(v) => setC({ ...c, size: v }, 'size')} />
          <Seg label={ta('ed.motion')} value={c.motion} options={(['none', 'bob', 'spin', 'blink'] as const).map((x) => [x, lbl(`motion.${x}`)] as const)} onChange={(v) => setC({ ...c, motion: v }, 'motion')} />
        </>
      )
    case 'divider':
      return <Select label={ta('ed.pattern')} value={c.pattern} options={DIVIDERS.map((x) => [x, lbl(`div.${x}`)] as const)} onChange={(v) => setC({ ...c, pattern: v }, 'pat')} />
    case 'construction':
      return (
        <Field label={ta('ed.badgeText')}>
          <input value={c.text} maxLength={80} onInput={(e) => setC({ ...c, text: e.currentTarget.value }, 't')} />
        </Field>
      )
  }
}

function LinkField(props: { value: string | undefined; onChange: (href: string | undefined) => void }) {
  const [v, setV] = useState(props.value ?? '')
  const [bad, setBad] = useState(false)
  return (
    <Field label={ta('ed.link')} hint={bad ? t('web.addrBad') : undefined}>
      <input
        value={v}
        inputMode="url"
        autocapitalize="off"
        aria-invalid={bad}
        placeholder="https://"
        onInput={(e) => setV(e.currentTarget.value)}
        onBlur={async () => {
          if (!v.trim()) {
            setBad(false)
            return props.onChange(undefined)
          }
          const { normalizeUserUrl } = await import('../../commands.ts')
          const href = normalizeUserUrl(v)
          setBad(!href)
          if (href) {
            setV(href)
            props.onChange(href)
          }
        }}
      />
    </Field>
  )
}

// ---------------------------------------------------------------------------- site identity

function SitePanel(props: { ctx: Ctx; d: SiteDesign; apply: Apply; upload: Upload; onBadge: () => void }) {
  const { ctx, d, apply } = props
  const site = ctx.project.site
  const btn = d.buttonAssetId ? ctx.project.assets.find((a) => a.id === d.buttonAssetId) : undefined
  const fav = d.faviconAssetId ? ctx.project.assets.find((a) => a.id === d.faviconAssetId) : undefined
  return (
    <div>
      <Section title={ta('site.identity')}>
        <Field label={ta('site.name')}>
          <input value={site.title} maxLength={80} onInput={(e) => ctx.apply(updateSite({ title: e.currentTarget.value }))} />
        </Field>
        <Field label={ta('site.tagline')}>
          <input value={site.tagline} maxLength={200} onInput={(e) => ctx.apply(updateSite({ tagline: e.currentTarget.value }))} />
        </Field>
        <Field label={ta('site.welcome')}>
          <input value={d.welcome} maxLength={200} placeholder={ta('site.welcomePh')} onInput={(e) => apply(D.setIdentity({ welcome: e.currentTarget.value }), 'welcome')} />
        </Field>
      </Section>
      <Section title={ta('site.favicon')}>
        <p class="muted small">{ta('site.faviconHint')}</p>
        {fav && <img class="fav-thumb" src={assetUrl(fav)} alt="" width={32} height={32} />}
        <div class="choice-row">
          <button
            type="button"
            class="btn btn-small"
            onClick={async () => {
              const id = await props.upload('favicon', 'favicon')
              if (id) apply(D.setIdentity({ faviconAssetId: id }))
            }}
          >
            <Icon name="upload" size={16} /> {ta('ed.upload')}
          </button>
          {fav && <button type="button" class="btn btn-small btn-danger" onClick={() => apply(D.setIdentity({ faviconAssetId: null }))}>{ta('ed.removeImage')}</button>}
        </div>
      </Section>
      <Section title={ta('site.badge')}>
        {btn && <img class="badge-real" src={assetUrl(btn)} alt="" width={88} height={31} />}
        <button type="button" class="btn btn-small" onClick={props.onBadge}><Icon name="badge" size={16} /> {ta('ed.editBadge')}</button>
      </Section>
      <Section title={ta('site.decorations')}>
        {d.assets.length === 0 && <p class="muted small">{ta('site.noDecorations')}</p>}
        <div class="thumb-grid">
          {d.assets.map((dec) => {
            const a = ctx.project.assets.find((x) => x.id === dec.id)
            if (!a) return null
            return (
              <div class="thumb" key={dec.id}>
                <img src={assetUrl(a)} alt="" />
                <button type="button" class="thumb-x" aria-label={ta('site.removeDecoration', { name: dec.name })} onClick={() => apply(D.removeDecoration(dec.id))}><Icon name="close" size={14} /></button>
              </div>
            )
          })}
        </div>
      </Section>
      {ctx.project.web.published && (
        <Section title={ta('at.revert')}>
          <button
            type="button"
            class="btn btn-small"
            onClick={() => {
              if (confirm(ta('at.revertConfirm'))) {
                const r = ctx.apply(revertDraft)
                if (!r.ok) ctx.toast(r.reason, 'error')
              }
            }}
          >
            <Icon name="undo" size={16} /> {ta('at.revert')}
          </button>
        </Section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------- publish

export function PublishDialog(props: { ctx: Ctx; onClose: () => void }) {
  const { ctx } = props
  const p = ctx.project
  const [server, setServer] = useState(savedServer())
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pub = publicProjection(p, 'draft')
  const hidden = p.posts.length - pub.posts.length

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      let next = publishDraft(new Date().toISOString())(ctx.project)
      const notes = await approvedNotes(p.site.slug, server)
      if (notes) next = setGuestbookSnapshot(notes)(next)
      const where = await publishSite(next, server)
      const r = ctx.replace(next)
      if (!r.ok) throw new Error(r.reason)
      setUrl(where)
      ctx.toast(ta('pubm.done', { url: where }))
    } catch (e) {
      setError(ta('pubm.fail', { why: (e as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={ta('pubm.title')}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="sheet-head">
          <h2>{ta('pubm.title')}</h2>
          <button type="button" class="icon-btn" aria-label={t('common.close')} onClick={props.onClose}><Icon name="close" /></button>
        </div>
        <div class="sheet-body">
          <p>{ta('pubm.body', { url: siteUrl(p.site.slug, server), e: pub.posts.length, p: pub.assets.length, h: hidden })}</p>
          <Field label={ta('pubm.server')} hint={t('pub.serverHint')}>
            <input value={server} inputMode="url" autocapitalize="off" placeholder={location.origin} onInput={(e) => setServer(e.currentTarget.value)} />
          </Field>
          {error && <p class="error" role="alert">{error}</p>}
          {url ? (
            <div class="card">
              <p>{ta('pubm.done', { url })}</p>
              <a class="btn btn-primary btn-block" href={url} target="_blank" rel="noopener">{ta('pubm.open')}</a>
            </div>
          ) : (
            <div class="sheet-actions">
              <button type="button" class="btn" onClick={props.onClose}>{ta('pubm.cancel')}</button>
              <button type="button" class="btn btn-primary" disabled={busy} onClick={go}>
                <Icon name="cloud" size={18} /> {busy ? ta('pubm.working') : ta('pubm.go')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Default tokens of a style, for swatches. */
export const swatchOf = (s: StyleId) => STARTER_TOKENS[s]
