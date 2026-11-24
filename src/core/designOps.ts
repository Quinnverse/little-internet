import {
  defaultSpan,
  DEFAULT_LAYOUT,
  DEFAULT_STYLE,
  MAX_PAGES,
  MAX_WIDGETS,
  newWidgetContent,
  pageWidgets,
  renumber,
  STARTER_TOKENS,
  starterWidgets,
  type DecorationAsset,
  type SiteDesign,
  type SitePage,
  type SiteWidget,
  type StyleId,
  type ThemeTokens,
  type WebsiteButton,
  type WidgetContent,
  type WidgetType,
} from './design.ts'

/**
 * Pure operations on a SiteDesign. The editor wraps each in a Command, the store validates the
 * result. None of them touches posts, the room or recordings: decorating the website never
 * changes the home or deletes an entry.
 */
export type DesignOp = (d: SiteDesign) => SiteDesign

const widgetsOf = (d: SiteDesign, pageId: string) => pageWidgets(d, pageId)

/** Adds a widget at `index` on a page (end of page when omitted). */
export const addWidget =
  (id: string, pageId: string, type: WidgetType, lang: 'en' | 'zh', index?: number, content?: WidgetContent): DesignOp =>
  (d) => {
    if (d.widgets.length >= MAX_WIDGETS) throw new Error('This website already has the most components it can hold')
    if (d.widgets.some((w) => w.id === id)) throw new Error('Duplicate id')
    if (!d.pages.some((p) => p.id === pageId)) throw new Error('No such page')
    const list = widgetsOf(d, pageId)
    const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length))
    const w: SiteWidget = {
      id,
      pageId,
      order: 0,
      hidden: false,
      layout: { ...DEFAULT_LAYOUT, span: defaultSpan(type), mobile: defaultSpan(type) === 1 ? 'half' : 'full' },
      style: { ...DEFAULT_STYLE },
      content: content ?? newWidgetContent(type, lang),
    }
    return withOrder(d, pageId, [...list.slice(0, at), w, ...list.slice(at)])
  }

export const removeWidget =
  (id: string): DesignOp =>
  (d) => ({ ...d, widgets: renumber(d.widgets.filter((w) => w.id !== id)) })

/** Moves a widget to position `index` within its page (drag-and-drop and up/down buttons). */
export const moveWidget =
  (id: string, index: number): DesignOp =>
  (d) => {
    const w = d.widgets.find((x) => x.id === id)
    if (!w) return d
    const rest = widgetsOf(d, w.pageId).filter((x) => x.id !== id)
    const at = Math.max(0, Math.min(Math.trunc(index), rest.length))
    return withOrder(d, w.pageId, [...rest.slice(0, at), w, ...rest.slice(at)])
  }

/** Moves a widget to the end of another page. */
export const moveWidgetToPage =
  (id: string, pageId: string): DesignOp =>
  (d) => {
    const w = d.widgets.find((x) => x.id === id)
    if (!w || w.pageId === pageId || !d.pages.some((p) => p.id === pageId)) return d
    const moved = { ...w, pageId, order: widgetsOf(d, pageId).length }
    return { ...d, widgets: renumber(d.widgets.map((x) => (x.id === id ? moved : x))) }
  }

export const duplicateWidget =
  (id: string, newId: string): DesignOp =>
  (d) => {
    const w = d.widgets.find((x) => x.id === id)
    if (!w) return d
    if (d.widgets.length >= MAX_WIDGETS) throw new Error('This website already has the most components it can hold')
    const list = widgetsOf(d, w.pageId)
    const at = list.findIndex((x) => x.id === id) + 1
    const copy = { ...structuredClone(w), id: newId }
    return withOrder(d, w.pageId, [...list.slice(0, at), copy, ...list.slice(at)])
  }

/** Replaces a widget's content. The type cannot change. */
export const setWidgetContent =
  (id: string, content: WidgetContent): DesignOp =>
  (d) => ({
    ...d,
    widgets: d.widgets.map((w) => {
      if (w.id !== id) return w
      if (w.content.type !== content.type) throw new Error('A component cannot change its type')
      return { ...w, content }
    }),
  })

export const setWidgetLayout =
  (id: string, patch: Partial<SiteWidget['layout']>): DesignOp =>
  (d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === id ? { ...w, layout: { ...w.layout, ...patch } } : w)) })

export const setWidgetStyle =
  (id: string, patch: Partial<Omit<SiteWidget['style'], 'bg' | 'fg'>> & { bg?: string | null; fg?: string | null }): DesignOp =>
  (d) => ({
    ...d,
    widgets: d.widgets.map((w) => {
      if (w.id !== id) return w
      const next: Record<string, unknown> = { ...w.style, ...patch }
      for (const k of ['bg', 'fg'] as const) if (next[k] === null || next[k] === undefined) delete next[k]
      return { ...w, style: next as SiteWidget['style'] }
    }),
  })

export const setWidgetHidden =
  (id: string, hidden: boolean): DesignOp =>
  (d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === id ? { ...w, hidden } : w)) })

export const setTokens =
  (patch: Partial<Omit<ThemeTokens, 'bgAssetId'>> & { bgAssetId?: string | null }): DesignOp =>
  (d) => {
    const next: Record<string, unknown> = { ...d.tokens, ...patch }
    if (next.bgAssetId === null || next.bgAssetId === undefined) delete next.bgAssetId
    return { ...d, tokens: next as ThemeTokens }
  }

export const setIdentity =
  (patch: { welcome?: string; faviconAssetId?: string | null }): DesignOp =>
  (d) => {
    const next: SiteDesign = { ...d, ...(patch.welcome !== undefined ? { welcome: patch.welcome } : {}) }
    if (patch.faviconAssetId === null) delete next.faviconAssetId
    else if (patch.faviconAssetId !== undefined) next.faviconAssetId = patch.faviconAssetId
    return next
  }

/**
 * Starts from a style. `keepWidgets` only restyles (colours, fonts, background); otherwise the
 * components of the current page are replaced by the style's starter set. Content is never touched.
 */
export const applyStyle =
  (style: StyleId, opts: { keepWidgets: boolean; pageId: string; lang: 'en' | 'zh'; newId: (i: number) => string }): DesignOp =>
  (d) => {
    const restyled: SiteDesign = { ...d, style, tokens: { ...STARTER_TOKENS[style] } }
    if (opts.keepWidgets) {
      // Widgets that forced a look follow the new style.
      return { ...restyled, widgets: d.widgets.map((w) => ({ ...w, style: { ...w.style, look: 'auto', tilt: style === 'scrapbook' ? w.style.tilt : 0 } })) }
    }
    const others = d.widgets.filter((w) => w.pageId !== opts.pageId)
    const fresh = starterWidgets(style, opts.lang, opts.pageId, opts.newId)
    return { ...restyled, widgets: renumber([...others, ...fresh]) }
  }

// ------------------------------------------------------------------ pages

export const addPage =
  (page: SitePage): DesignOp =>
  (d) => {
    if (d.pages.length >= MAX_PAGES) throw new Error('A website can have up to 8 pages')
    if (d.pages.some((p) => p.id === page.id || p.slug === page.slug)) throw new Error('That page address is taken')
    if (page.slug === 'index') throw new Error('That page address is taken')
    return { ...d, pages: [...d.pages, page] }
  }

export const updatePage =
  (id: string, patch: Partial<Omit<SitePage, 'id'>>): DesignOp =>
  (d) => {
    const isHome = d.pages[0]?.id === id
    if (patch.slug !== undefined) {
      if (isHome) throw new Error('The home page address cannot change')
      if (patch.slug === 'index' || d.pages.some((p) => p.id !== id && p.slug === patch.slug)) throw new Error('That page address is taken')
    }
    return { ...d, pages: d.pages.map((p) => (p.id === id ? { ...p, ...patch, id } : p)) }
  }

/** Removes a page and its components. The home page stays. */
export const removePage =
  (id: string): DesignOp =>
  (d) => {
    if (d.pages[0]?.id === id) throw new Error('The home page cannot be removed')
    return { ...d, pages: d.pages.filter((p) => p.id !== id), widgets: renumber(d.widgets.filter((w) => w.pageId !== id)) }
  }

export const movePage =
  (id: string, delta: -1 | 1): DesignOp =>
  (d) => {
    const i = d.pages.findIndex((p) => p.id === id)
    const j = i + delta
    // The home page is always first.
    if (i <= 0 || j <= 0 || j >= d.pages.length) return d
    const pages = [...d.pages]
    ;[pages[i], pages[j]] = [pages[j]!, pages[i]!]
    return { ...d, pages }
  }

// ------------------------------------------------------------------ decorations and badge

export const addDecoration =
  (asset: DecorationAsset): DesignOp =>
  (d) => ({ ...d, assets: [...d.assets.filter((a) => a.id !== asset.id), asset] })

/** Removes a decoration and every reference to it. */
export const removeDecoration =
  (id: string): DesignOp =>
  (d) => {
    const tokens: Record<string, unknown> = { ...d.tokens }
    if (tokens.bgAssetId === id) delete tokens.bgAssetId
    const next: SiteDesign = {
      ...d,
      tokens: tokens as ThemeTokens,
      assets: d.assets.filter((a) => a.id !== id),
      widgets: d.widgets.map((w) => {
        const c = w.content
        if ((c.type === 'about' || c.type === 'image' || c.type === 'sticker') && c.assetId === id) {
          const { assetId: _a, ...rest } = c
          return { ...w, content: rest as WidgetContent }
        }
        if (c.type === 'gallery' && c.assetIds.includes(id)) return { ...w, content: { ...c, assetIds: c.assetIds.filter((x) => x !== id) } }
        return w
      }),
    }
    if (next.faviconAssetId === id) delete next.faviconAssetId
    if (next.buttonAssetId === id) delete next.buttonAssetId
    if (next.button.imageAssetId === id) {
      const { imageAssetId: _i, ...b } = next.button
      next.button = b
    }
    return next
  }

export const setButton =
  (button: WebsiteButton, renderedAssetId: string | null): DesignOp =>
  (d) => {
    const next: SiteDesign = { ...d, button }
    if (renderedAssetId) next.buttonAssetId = renderedAssetId
    else delete next.buttonAssetId
    return next
  }

function withOrder(d: SiteDesign, pageId: string, ordered: SiteWidget[]): SiteDesign {
  const others = d.widgets.filter((w) => w.pageId !== pageId)
  return { ...d, widgets: [...others, ...ordered.map((w, i) => ({ ...w, order: i }))] }
}
