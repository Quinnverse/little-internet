import ghostRuntime from '../runtime/ghost.js?raw'
import roomRuntime from '../runtime/room.bundle.js?raw'
import siteRuntime from '../runtime/site.js?raw'
import { escapeHtml, jsonForScript } from './escape.ts'
import { normalize } from './normalize.ts'
import { publicProjection, type DesignChoice } from './privacy.ts'
import { generateFeed } from './rss.ts'
import { toStored } from './storage.ts'
import { assetPath, isCanonicalHttpUrl, MIME_EXT, recordingPath, type Asset, type Post, type Project } from './schema.ts'
import { pageWidgets, type SiteDesign, type SitePage, type SiteWidget } from './design.ts'
import { designCss } from './siteCss.ts'
import { spriteSvg } from './pixels.ts'
import { roomData } from './roomData.ts'
import { fmt, htmlLang, siteStrings, type SiteKey } from './strings.ts'
import { embedSrc, VIDEO_FRAME_HOSTS } from './video.ts'

export type GenerateOptions = {
  /** Absolute URL where the site will live, ending in "/". Used for RSS links and the badge code. */
  baseUrl?: string
  /** Which design to build. Publishing and export use the published snapshot (default). */
  design?: DesignChoice
}

export type SiteFiles = Map<string, Uint8Array>

export const CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "media-src 'self'",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  `frame-src ${VIDEO_FRAME_HOSTS.join(' ')}`,
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const enc = new TextEncoder()
const h = escapeHtml

/** Path of a page file relative to the site root. */
export function pagePath(d: SiteDesign, page: SitePage): string {
  return d.pages[0]?.id === page.id ? 'index.html' : `pages/${page.slug}.html`
}

/** The 88×31 badge file name, when the design has one. */
export function buttonFile(pub: Project): { path: string; asset: Asset } | undefined {
  const id = pub.web.draft.buttonAssetId
  const asset = id ? pub.assets.find((a) => a.id === id) : undefined
  return asset ? { path: `button.${MIME_EXT[asset.mime]}`, asset } : undefined
}

/**
 * The single code path that turns a Project into website files.
 * Publishing uploads this output; exporting zips it; the Atelier preview renders the same pages.
 */
export function generateSite(project: Project, opts: GenerateOptions = {}): SiteFiles {
  const baseUrl = normalizeBaseUrl(opts.baseUrl)
  const pub = normalize(publicProjection(project, opts.design ?? 'published'))
  const d = pub.web.draft
  const out = new Map<string, string | Uint8Array>()
  const r = siteRenderer(pub, { mode: 'site', baseUrl })

  for (const page of d.pages) out.set(pagePath(d, page), r.page(page))
  for (const post of pub.posts) out.set(`posts/${post.slug}.html`, r.post(post))
  out.set('style.css', designCss(pub, (p) => p))
  out.set('site.js', siteRuntime)
  out.set('ghost.js', ghostRuntime)
  out.set('room.js', roomRuntime)
  out.set('feed.xml', generateFeed(pub, baseUrl))
  for (const a of pub.assets) out.set(assetPath(a.id, a.mime), a.data)
  for (const rec of pub.recordings) out.set(recordingPath(rec.id, rec.mime), rec.data)
  const btn = buttonFile(pub)
  if (btn) out.set(btn.path, btn.asset.data)

  out.set('site.json', `${JSON.stringify(toStored(pub).stored, null, 2)}\n`)

  const files: SiteFiles = new Map()
  for (const path of [...out.keys()].sort()) {
    const v = out.get(path)!
    files.set(path, typeof v === 'string' ? enc.encode(v) : v)
  }
  return files
}

/**
 * One page of the DRAFT design as a self-contained document for the Atelier's live preview:
 * the same renderer as the real site, with CSS inlined, no scripts, and `urlFor` mapping
 * site-relative file paths (assets/…, audio/…) to URLs the editor can show.
 */
export function renderPreviewPage(project: Project, pageId: string, urlFor: (path: string) => string): string {
  const pub = normalize(publicProjection(project, 'draft'))
  const d = pub.web.draft
  const page = d.pages.find((p) => p.id === pageId) ?? d.pages[0]!
  const r = siteRenderer(pub, { mode: 'preview', urlFor })
  return r.page(page)
}

function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined
  const withSlash = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  if (!isCanonicalHttpUrl(withSlash)) throw new RangeError('baseUrl must be a plain http(s) URL')
  return withSlash
}

// ---------------------------------------------------------------------------- renderer

type RenderMode = { mode: 'site'; baseUrl?: string } | { mode: 'preview'; urlFor: (path: string) => string }

function siteRenderer(pub: Project, m: RenderMode) {
  const d = pub.web.draft
  const S = siteStrings(pub.site.lang)
  const T = (k: SiteKey) => S[k]
  const preview = m.mode === 'preview'
  /** URL of a site file from a page whose root prefix is `prefix`. */
  const file = (prefix: string, path: string) => (m.mode === 'preview' ? m.urlFor(path) : `${prefix}${path}`)
  const assetSrc = (prefix: string, a: Asset) => file(prefix, assetPath(a.id, a.mime))
  const findAsset = (id: string | undefined) => (id ? pub.assets.find((a) => a.id === id) : undefined)
  const posts = new Map(pub.posts.map((p) => [p.id, p]))
  const indexPage = d.pages[0]!

  type Doc = { title: string; prefix: string; main: string; bodyClass: string; room?: boolean; current?: string }

  function doc({ title, prefix, main, bodyClass, room, current }: Doc): string {
    const roomScripts =
      room && !preview
        ? `<script type="application/json" id="room-data">${jsonForScript(roomData(pub))}</script>\n` +
          `<script src="${prefix}room.js" defer></script>\n`
        : ''
    const ghost =
      pub.ghost.enabled && !preview
        ? `<script type="application/json" id="ghost-data">${jsonForScript(ghostData(prefix))}</script>\n` +
          `<script src="${prefix}ghost.js" defer></script>\n`
        : ''
    const siteScript = preview
      ? ''
      : `<script type="application/json" id="site-data">${jsonForScript(siteData())}</script>\n<script src="${prefix}site.js" defer></script>\n`
    const css = preview
      ? `<style>${designCss(pub, (p) => file(prefix, p))}</style>\n`
      : `<meta http-equiv="Content-Security-Policy" content="${h(CSP)}">\n<link rel="stylesheet" href="${prefix}style.css">\n`
    const fav = findAsset(d.faviconAssetId)
    const icon = fav ? `<link rel="icon" href="${h(assetSrc(prefix, fav))}">\n` : ''
    return `<!doctype html>
<html lang="${htmlLang(pub.site.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${css}<meta name="generator" content="Little Internet">
<title>${h(title)}</title>
${icon}<link rel="alternate" type="application/rss+xml" title="${h(pub.site.title)}" href="${prefix}feed.xml">
${siteScript}${ghost}${roomScripts}</head>
<body class="${bodyClass} style-${d.style}">
<div class="wrap">
${header(prefix, current)}
${main}
${footer(prefix)}
</div>
</body>
</html>
`
  }

  function header(prefix: string, current: string | undefined): string {
    const navPages = d.pages.filter((p) => p.nav)
    const nav =
      navPages.length > 1
        ? `<nav class="site-nav" aria-label="${h(T('pages'))}">${navPages
            .map(
              (p) =>
                `<a href="${prefix}${pagePath(d, p)}"${p.id === current ? ' aria-current="page"' : ''}>${h(p.title)}</a>`,
            )
            .join('')}</nav>\n`
        : ''
    const welcome = d.welcome ? `<p class="welcome-banner"><span>${h(d.welcome)}</span></p>\n` : ''
    const demo = pub.site.demo ? `<p class="demo-banner">${h(T('demoBanner'))}</p>\n` : ''
    return `<header class="site-header">
${demo}<p class="site-title"><a href="${prefix}index.html">${h(pub.site.title)}</a></p>
${pub.site.tagline ? `<p class="tagline">${h(pub.site.tagline)}</p>\n` : ''}${welcome}${nav}</header>`
  }

  function footer(prefix: string): string {
    const w = pub.webring
    const ring = [
      w.prev && `<a href="${h(w.prev)}" rel="noopener">${h(T('prev'))}</a>`,
      w.hub && `<a href="${h(w.hub)}" rel="noopener">${h(T('webring'))}</a>`,
      w.random && `<a href="${h(w.random)}" rel="noopener">${h(T('random'))}</a>`,
      w.next && `<a href="${h(w.next)}" rel="noopener">${h(T('next'))}</a>`,
    ].filter(Boolean)
    const hasRingWidget = d.widgets.some((x) => x.content.type === 'webring')
    const ringNav =
      ring.length && !hasRingWidget ? `<nav class="webring" aria-label="${h(T('webring'))}">${ring.join(' ')}</nav>\n` : ''
    return `<footer class="site-footer">
${ringNav}<p><a href="${prefix}feed.xml">${h(T('rss'))}</a> · ${h(T('madeWith'))}</p>
</footer>`
  }

  function page(p: SitePage): string {
    const prefix = p.id === indexPage.id ? '' : '../'
    const widgets = pageWidgets(d, p.id)
      .map((w) => widget(w, prefix))
      .join('\n')
    const isIndex = p.id === indexPage.id
    return doc({
      title: isIndex ? pub.site.title : `${p.title} · ${pub.site.title}`,
      prefix,
      bodyClass: isIndex ? 'home' : 'subpage',
      room: isIndex,
      current: p.id,
      main: `<main class="page-grid cols-${p.columns}" data-page="${p.id}">\n${widgets}\n</main>`,
    })
  }

  function widget(w: SiteWidget, prefix: string): string {
    const look = w.style.look === 'auto' ? d.tokens.look : w.style.look
    const inner = widgetInner(w, prefix)
    return `<section class="w w-${w.id} t-${w.content.type} look-${look}" id="w-${w.id}" data-w="${w.id}">${inner}</section>`
  }

  const head = (s: string) => (s ? `<h2>${h(s)}</h2>` : '')

  function widgetInner(w: SiteWidget, prefix: string): string {
    const c = w.content
    switch (c.type) {
      case 'welcome':
        return `${head(c.heading)}${c.text ? paragraphs(c.text) : ''}`
      case 'about': {
        const a = findAsset(c.assetId)
        const img = a ? `<img class="about-photo" src="${h(assetSrc(prefix, a))}" alt="" loading="lazy">` : ''
        return `${head(c.heading)}${img}${c.text ? paragraphs(c.text) : ''}`
      }
      case 'diary': {
        const list =
          c.mode === 'latest'
            ? pub.posts.slice(0, c.count)
            : c.postIds.map((id) => posts.get(id)).filter((x): x is Post => x !== undefined)
        if (list.length === 0) return `${head(c.heading)}<p class="muted">${h(T('noEntries'))}</p>`
        const items = list
          .map((post) => {
            const cover = post.imageIds[0] ? findAsset(post.imageIds[0]) : undefined
            const img = cover && c.excerpts ? `<img src="${h(assetSrc(prefix, cover))}" alt="" loading="lazy">` : ''
            const ex = c.excerpts && post.body ? `<p>${h(excerpt(post.body))}</p>` : ''
            return (
              `<li><a class="entry" href="${prefix}posts/${post.slug}.html">${img}` +
              `<span class="entry-title">${h(post.title || post.createdAt.slice(0, 10))}</span>` +
              `<time datetime="${post.createdAt}">${post.createdAt.slice(0, 10)}</time>${ex}</a></li>`
            )
          })
          .join('')
        return `${head(c.heading)}<ul class="entries${c.excerpts ? ' with-excerpts' : ''}">${items}</ul>`
      }
      case 'gallery': {
        const shots: { a: Asset; href?: string }[] = []
        if (c.source === 'posts') {
          for (const post of pub.posts) {
            for (const id of post.imageIds) {
              const a = findAsset(id)
              if (a) shots.push({ a, href: `${prefix}posts/${post.slug}.html` })
            }
          }
        } else {
          for (const id of c.assetIds) {
            const a = findAsset(id)
            if (a) shots.push({ a })
          }
        }
        const pics = shots.slice(0, c.count)
        if (pics.length === 0) return `${head(c.heading)}<p class="muted">${h(T('noPhotos'))}</p>`
        const items = pics
          .map(({ a, href }) => {
            const img = `<img src="${h(assetSrc(prefix, a))}" alt="" loading="lazy">`
            return `<li>${href ? `<a href="${href}">${img}</a>` : img}</li>`
          })
          .join('')
        return `${head(c.heading)}<ul class="gallery">${items}</ul>`
      }
      case 'bookshelf': {
        if (c.books.length === 0) return `${head(c.heading)}<p class="muted">${h(T('noBooks'))}</p>`
        const items = c.books
          .map(
            (b) =>
              `<li><span class="book-title">${h(b.title)}</span>${b.author ? `<span class="book-author">${h(fmt(T('by'), { author: b.author }))}</span>` : ''}${b.note ? `<span class="book-note">${h(b.note)}</span>` : ''}</li>`,
          )
          .join('')
        return `${head(c.heading)}<ul class="books">${items}</ul>`
      }
      case 'memories': {
        const items = pub.room.memory
          .map((mo) => {
            const post = posts.get(mo.postId)
            if (!post) return ''
            return `<li><a href="${prefix}posts/${post.slug}.html"><span class="keepsake-kind k-${mo.kind}">${h(T('keepsake'))}</span><span class="entry-title">${h(post.title || post.createdAt.slice(0, 10))}</span><time datetime="${post.createdAt}">${post.createdAt.slice(0, 10)}</time></a></li>`
          })
          .join('')
        if (!items) return `${head(c.heading)}<p class="muted">${h(T('noMemories'))}</p>`
        return `${head(c.heading)}<ul class="keepsakes">${items}</ul>`
      }
      case 'audio': {
        const rec =
          (pub.room.welcomeRecordingId && pub.recordings.find((x) => x.id === pub.room.welcomeRecordingId)) ||
          pub.recordings[0]
        if (!rec) return `${head(c.heading)}<p class="muted">${h(T('noWelcome'))}</p>`
        const secs = Math.max(1, Math.round(rec.durationMs / 1000))
        return (
          `${head(c.heading)}${c.text ? `<p>${h(c.text)}</p>` : ''}` +
          `<p class="rec-meta">${h(rec.title || T('aMessage'))} · ${secs}s</p>` +
          `<audio controls preload="none" src="${h(file(prefix, recordingPath(rec.id, rec.mime)))}"></audio>` +
          `<p class="muted small">${h(T('pressPlay'))}</p>`
        )
      }
      case 'boo': {
        const firstBoo = d.widgets.find((x) => x.content.type === 'boo' && x.pageId === w.pageId)?.id === w.id
        const live = !preview && pub.ghost.enabled && firstBoo
        return `${head(c.heading)}<div class="ghost-home"${live ? ' data-ghost-home' : ''}>${live ? '' : spriteSvg('ghost', 'px px-boo')}</div>`
      }
      case 'guestbook': {
        const notes = pub.web.guestbook
        const list = notes.length
          ? notes
              .slice(0, 50)
              .map(
                (n) =>
                  `<li><strong>${h(n.name)}</strong> <time datetime="${n.createdAt}">${n.createdAt.slice(0, 10)}</time><p>${h(n.text)}</p></li>`,
              )
              .join('')
          : ''
        const listHtml = `<ul class="gb-list" data-gb-list>${list || `<li class="muted">${h(T('gbEmpty'))}</li>`}</ul>`
        if (!c.open) return `${head(c.heading)}<p class="muted">${h(T('gbClosed'))}</p>${listHtml}`
        const form =
          `<form class="gb-form" data-gb hidden>` +
          `<input name="name" maxlength="40" placeholder="${h(T('yourName'))}" aria-label="${h(T('yourName'))}">` +
          `<textarea name="text" maxlength="300" required placeholder="${h(T('yourNote'))}" aria-label="${h(T('yourNote'))}"></textarea>` +
          `<input name="website" class="gb-trap" tabindex="-1" autocomplete="off" aria-hidden="true">` +
          `<button type="submit">${h(T('send'))}</button></form>`
        return `${head(c.heading)}${c.intro ? `<p>${h(c.intro)}</p>` : ''}${form}<p class="gb-status muted small" data-gb-status>${h(T('gbOffline'))}</p>${listHtml}`
      }
      case 'links': {
        if (pub.links.length === 0) return `${head(c.heading)}<p class="muted">${h(T('noFriends'))}</p>`
        const items = pub.links
          .map((l) => {
            const badge = c.look === 'buttons' ? findAsset(l.buttonAssetId) : undefined
            const label = badge
              ? `<img class="badge88" src="${h(assetSrc(prefix, badge))}" width="88" height="31" alt="${h(l.title)}">`
              : `<span class="${c.look === 'buttons' ? 'badge88 badge-text' : ''}">${h(l.title)}</span>`
            return `<li><a href="${h(l.url)}" rel="noopener">${label}</a></li>`
          })
          .join('')
        return `${head(c.heading)}<ul class="links links-${c.look}">${items}</ul>`
      }
      case 'webring': {
        const w2 = pub.webring
        const parts = [
          w2.prev && `<a class="ring-btn" href="${h(w2.prev)}" rel="noopener">${h(T('prev'))}</a>`,
          w2.random && `<a class="ring-btn" href="${h(w2.random)}" rel="noopener">${h(T('random'))}</a>`,
          w2.next && `<a class="ring-btn" href="${h(w2.next)}" rel="noopener">${h(T('next'))}</a>`,
        ].filter(Boolean)
        const hub = w2.hub ? `<p class="small"><a href="${h(w2.hub)}" rel="noopener">${h(T('webring'))} ↗</a></p>` : ''
        if (!parts.length && !hub) return `${head(c.heading)}<p class="muted">${h(T('ringJoin'))}</p>`
        return `${head(c.heading)}<nav class="ring" aria-label="${h(T('webring'))}">${parts.join('')}</nav>${hub}`
      }
      case 'button': {
        const btn = buttonFile(pub)
        if (!btn) return `${head(c.heading)}<p><span class="badge88 badge-text">${h(pub.site.title)}</span></p>`
        const src = file(prefix, btn.path)
        const home = m.mode === 'site' && m.baseUrl ? m.baseUrl : ''
        const code = `<a href="${home || './'}"><img src="${home}${btn.path}" width="88" height="31" alt="${h(pub.site.title)}"></a>`
        return (
          `${head(c.heading)}<p><img class="badge88" src="${h(src)}" width="88" height="31" alt="${h(pub.site.title)}"></p>` +
          `<p class="small">${h(T('linkToMe'))}</p>` +
          `<textarea class="badge-code" readonly rows="3" data-badge-code data-file="${h(btn.path)}" data-prefix="${prefix}" data-title="${h(pub.site.title)}"${home ? ' data-abs="1"' : ''}>${h(code)}</textarea>` +
          `<button type="button" class="copy-btn" data-copy hidden>${h(T('copy'))}</button>`
        )
      }
      case 'text':
        return `${head(c.heading)}${c.text ? paragraphs(c.text) : ''}`
      case 'image': {
        const a = findAsset(c.assetId)
        if (!a) return ''
        const img = `<img src="${h(assetSrc(prefix, a))}" alt="${h(c.caption)}" loading="lazy">`
        const linked = c.href ? `<a href="${h(c.href)}" rel="noopener">${img}</a>` : img
        return `<figure>${linked}${c.caption ? `<figcaption>${h(c.caption)}</figcaption>` : ''}</figure>`
      }
      case 'sticker': {
        const a = findAsset(c.assetId)
        const art = a ? `<img src="${h(assetSrc(prefix, a))}" alt="" loading="lazy">` : spriteSvg(c.sticker)
        return `<div class="sticker size-${c.size} motion-${c.motion}">${art}</div>`
      }
      case 'divider':
        return `<div class="divider dv-${c.pattern}" role="separator"></div>`
      case 'construction':
        return `<div class="construction">${spriteSvg('construction', 'px px-cone')}<span>${h(c.text)}</span>${spriteSvg('construction', 'px px-cone')}</div>`
    }
  }

  function post(p: Post): string {
    const prefix = '../'
    const images = p.imageIds
      .map((id) => findAsset(id))
      .filter((a) => a !== undefined)
      .map((a) => `<figure><img src="${h(assetSrc(prefix, a))}" alt="" loading="lazy"></figure>`)
      .join('\n')
    const video = p.video
      ? `<div class="video"><iframe src="${embedSrc(p.video)}" title="${h(T('video'))}" loading="lazy" ` +
        `allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
      : ''
    const main = `<main class="post">
<p class="back"><a href="${prefix}index.html">← ${h(T('home'))}</a></p>
<article>
<h1>${h(p.title)}</h1>
<p class="date"><time datetime="${p.createdAt}">${p.createdAt.slice(0, 10)}</time></p>
${paragraphs(p.body)}
${images}
${video}
</article>
</main>`
    return doc({ title: `${p.title} · ${pub.site.title}`, prefix, main, bodyClass: 'post-page' })
  }

  // ---------------------------------------------------------------------- runtime data

  function siteData() {
    return {
      v: 1,
      slug: pub.site.slug,
      t: { gbOffline: T('gbOffline'), gbEmpty: T('gbEmpty'), gbSending: T('gbSending'), thanks: T('thanks'), sendFail: T('sendFail'), guestHint: T('guestHint'), copied: T('copied'), copy: T('copy') },
    }
  }

  type GuideItem = { label: string; href: string }

  /** Public-only data for ghost.js (ghost spec, Requirement 2.2). */
  function ghostData(prefix: string) {
    const guide: GuideItem[] = []
    const latest = pub.posts[0]
    const latestTitle = latest ? latest.title || latest.createdAt.slice(0, 10) : ''
    if (latest) guide.push({ label: fmt(T('readTitle'), { title: latestTitle }), href: `${prefix}posts/${latest.slug}.html` })
    const onIndex = (type: SiteWidget['content']['type']) => pageWidgets(d, indexPage.id).find((w) => w.content.type === type)
    const audio = onIndex('audio')
    if (pub.recordings.length && audio) guide.push({ label: T('listen'), href: `${prefix}index.html#w-${audio.id}` })
    const links = onIndex('links')
    if (links) guide.push({ label: T('meet'), href: `${prefix}index.html#w-${links.id}` })
    if (pub.webring.random) guide.push({ label: T('randomSite'), href: pub.webring.random })
    guide.push({ label: T('followRss'), href: `${prefix}feed.xml` })
    return {
      enabled: pub.ghost.enabled,
      name: pub.ghost.name,
      color: pub.ghost.color,
      greeting: fmt(T('greeting'), { name: pub.ghost.name || T('fallbackName'), site: pub.site.title }),
      ...(pub.site.lang === 'zh' ? { aria: `${pub.ghost.name || T('fallbackName')} · 带你逛这个家`, newText: '有新内容：' } : {}),
      guide: guide.slice(0, 4),
      ...(latest
        ? { latest: { title: latestTitle, href: `${prefix}posts/${latest.slug}.html`, createdAt: latest.createdAt } }
        : {}),
    }
  }

  return { page, post }
}

// ---------------------------------------------------------------------------- text

function lines(s: string): string {
  return s.replace(/\r\n?/g, '\n').split('\n').map(h).join('<br>')
}

function paragraphs(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${lines(p)}</p>`)
    .join('\n')
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length > 140 ? `${chars.slice(0, 140).join('')}…` : flat
}
