import ghostRuntime from '../runtime/ghost.js?raw'
import { escapeHtml, jsonForScript } from './escape.ts'
import { normalize } from './normalize.ts'
import { publicProjection } from './privacy.ts'
import { generateFeed } from './rss.ts'
import { toStored } from './storage.ts'
import { assetPath, isCanonicalHttpUrl, type Block, type Post, type Project } from './schema.ts'
import { themeCss } from './themes.ts'
import { embedSrc, VIDEO_FRAME_HOSTS } from './video.ts'

export type GenerateOptions = {
  /** Absolute URL where the site will live, ending in "/". Only used for RSS links. */
  baseUrl?: string
}

export type SiteFiles = Map<string, Uint8Array>

export const CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  `frame-src ${VIDEO_FRAME_HOSTS.join(' ')}`,
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const enc = new TextEncoder()
const h = escapeHtml

/**
 * The single code path that turns a Project into website files.
 * Publishing uploads this output; exporting zips it.
 */
export function generateSite(project: Project, opts: GenerateOptions = {}): SiteFiles {
  const baseUrl = normalizeBaseUrl(opts.baseUrl)
  const pub = normalize(publicProjection(project))
  const out = new Map<string, string | Uint8Array>()

  out.set('index.html', renderIndex(pub))
  for (const post of pub.posts) out.set(`posts/${post.slug}.html`, renderPost(pub, post))
  out.set('style.css', renderCss(pub))
  out.set('ghost.js', ghostRuntime)
  out.set('feed.xml', generateFeed(pub, baseUrl))
  for (const a of pub.assets) out.set(assetPath(a.id, a.mime), a.data)

  out.set('site.json', `${JSON.stringify(toStored(pub).stored, null, 2)}\n`)

  const files: SiteFiles = new Map()
  for (const path of [...out.keys()].sort()) {
    const v = out.get(path)!
    files.set(path, typeof v === 'string' ? enc.encode(v) : v)
  }
  return files
}

function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined
  const withSlash = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  if (!isCanonicalHttpUrl(withSlash)) throw new RangeError('baseUrl must be a plain http(s) URL')
  return withSlash
}

// ---------------------------------------------------------------------------- pages

type PageParts = { pub: Project; title: string; prefix: string; main: string; bodyClass: string }

function page({ pub, title, prefix, main, bodyClass }: PageParts): string {
  const ghost = pub.ghost.enabled
    ? `<script type="application/json" id="ghost-data">${jsonForScript(ghostData(pub, prefix))}</script>\n` +
      `<script src="${prefix}ghost.js" defer></script>\n`
    : ''
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${h(CSP)}">
<meta name="generator" content="Little Internet">
<title>${h(title)}</title>
<link rel="stylesheet" href="${prefix}style.css">
<link rel="alternate" type="application/rss+xml" title="${h(pub.site.title)}" href="${prefix}feed.xml">
${ghost}</head>
<body class="${bodyClass}">
<div class="wrap">
<header class="site-header">
<p class="site-title"><a href="${prefix}index.html">${h(pub.site.title)}</a></p>
${pub.site.tagline ? `<p class="tagline">${h(pub.site.tagline)}</p>\n` : ''}</header>
${main}
${renderFooter(pub, prefix)}
</div>
</body>
</html>
`
}

function renderIndex(pub: Project): string {
  const firstLinks = pub.blocks.find((b) => b.content.kind === 'links')?.id
  const blocks = pub.blocks.map((b) => renderBlock(pub, b, b.id === firstLinks)).join('\n')
  return page({
    pub,
    title: pub.site.title,
    prefix: '',
    bodyClass: 'home',
    main: `<main class="grid">\n${blocks}\n</main>`,
  })
}

function renderBlock(pub: Project, b: Block, anchorLinks: boolean): string {
  const c = b.content
  let inner = ''
  switch (c.kind) {
    case 'post': {
      const post = pub.posts.find((p) => p.id === c.postId)
      inner = post ? postCard(pub, post, '') : ''
      break
    }
    case 'image': {
      const asset = pub.assets.find((a) => a.id === c.assetId)
      inner = asset ? `<img src="${assetPath(asset.id, asset.mime)}" alt="" loading="lazy">` : ''
      break
    }
    case 'text':
      inner = `<p>${lines(c.text)}</p>`
      break
    case 'links':
      inner = `<h2>Friends</h2>\n${linkList(pub)}`
      break
    case 'latest':
      inner = `<h2>Latest</h2>\n${latestList(pub, '')}`
      break
    case 'ghost-home':
      inner = '<div class="ghost-home" data-ghost-home></div>'
      break
  }
  const id = anchorLinks ? ' id="links"' : ''
  return `<section class="block b-${b.id} k-${c.kind}"${id}>${inner}</section>`
}

function postCard(pub: Project, post: Post, prefix: string): string {
  const cover = post.imageIds[0] ? pub.assets.find((a) => a.id === post.imageIds[0]) : undefined
  const img = cover ? `<img src="${prefix}${assetPath(cover.id, cover.mime)}" alt="" loading="lazy">` : ''
  return (
    `<a class="card" href="${prefix}posts/${post.slug}.html">${img}` +
    `<h2>${h(post.title)}</h2><p>${h(excerpt(post.body))}</p>` +
    `<time datetime="${post.createdAt}">${post.createdAt.slice(0, 10)}</time></a>`
  )
}

function linkList(pub: Project): string {
  if (pub.links.length === 0) return '<p class="muted">No friends linked yet.</p>'
  const items = pub.links
    .map((l) => `<li><a href="${h(l.url)}" rel="noopener">${h(l.title)}</a></li>`)
    .join('')
  return `<ul class="links">${items}</ul>`
}

function latestList(pub: Project, prefix: string): string {
  if (pub.posts.length === 0) return '<p class="muted">Nothing here yet.</p>'
  const items = pub.posts
    .slice(0, 5)
    .map((p) => `<li><a href="${prefix}posts/${p.slug}.html">${h(p.title)}</a></li>`)
    .join('')
  return `<ul class="latest">${items}</ul>`
}

function renderPost(pub: Project, post: Post): string {
  const prefix = '../'
  const images = post.imageIds
    .map((id) => pub.assets.find((a) => a.id === id))
    .filter((a) => a !== undefined)
    .map((a) => `<figure><img src="${prefix}${assetPath(a.id, a.mime)}" alt="" loading="lazy"></figure>`)
    .join('\n')
  const video = post.video
    ? `<div class="video"><iframe src="${embedSrc(post.video)}" title="Video" loading="lazy" ` +
      `allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    : ''
  const main = `<main class="post">
<p class="back"><a href="${prefix}index.html">← Home</a></p>
<article>
<h1>${h(post.title)}</h1>
<p class="date"><time datetime="${post.createdAt}">${post.createdAt.slice(0, 10)}</time></p>
${paragraphs(post.body)}
${images}
${video}
</article>
</main>`
  return page({ pub, title: `${post.title} · ${pub.site.title}`, prefix, main, bodyClass: 'post-page' })
}

function renderFooter(pub: Project, prefix: string): string {
  const w = pub.webring
  const ring = [
    w.prev && `<a href="${h(w.prev)}" rel="noopener">← Prev</a>`,
    w.hub && `<a href="${h(w.hub)}" rel="noopener">Webring</a>`,
    w.random && `<a href="${h(w.random)}" rel="noopener">Random</a>`,
    w.next && `<a href="${h(w.next)}" rel="noopener">Next →</a>`,
  ].filter(Boolean)
  const ringNav = ring.length ? `<nav class="webring" aria-label="Webring">${ring.join(' ')}</nav>\n` : ''
  return `<footer class="site-footer">
${ringNav}<p><a href="${prefix}feed.xml">RSS</a> · Made with Little Internet</p>
</footer>`
}

// ---------------------------------------------------------------------------- ghost

type GuideItem = { label: string; href: string }

function ghostData(pub: Project, prefix: string) {
  const guide: GuideItem[] = []
  const latest = pub.posts[0]
  if (latest) guide.push({ label: `Read “${latest.title}”`, href: `${prefix}posts/${latest.slug}.html` })
  if (pub.blocks.some((b) => b.content.kind === 'links')) {
    guide.push({ label: 'Meet my friends', href: `${prefix}index.html#links` })
  }
  if (pub.webring.random) guide.push({ label: 'Visit a random site', href: pub.webring.random })
  return {
    enabled: pub.ghost.enabled,
    name: pub.ghost.name,
    color: pub.ghost.color,
    greeting: `Hi, I’m ${pub.ghost.name}. Welcome to ${pub.site.title}!`,
    guide,
  }
}

// ---------------------------------------------------------------------------- css

const BASE_CSS = `*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);line-height:1.5}
a{color:var(--accent)}
.wrap{max-width:720px;margin:0 auto;padding:16px;container-type:inline-size}
.site-header{margin-bottom:16px}
.site-title{font-size:1.6rem;font-weight:700;margin:0}
.site-title a{color:var(--fg);text-decoration:none}
.tagline,.muted,.date{color:var(--muted);margin:4px 0 0}
.grid{--gap:8px;display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:calc((100cqi - 3 * var(--gap)) / 4);gap:var(--gap)}
.block{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;padding:10px;min-width:0}
.block h2{font-size:1rem;margin:0 0 6px}
.block p{margin:0}
.block ul{margin:0;padding-left:1.1em}
.k-image{padding:0}
.k-image img,.card img{width:100%;height:100%;object-fit:cover;display:block}
.card{display:flex;flex-direction:column;height:100%;color:inherit;text-decoration:none}
.card img{height:auto;max-height:55%;border-radius:8px;margin-bottom:6px}
.card p{overflow:hidden;flex:1;color:var(--muted)}
.card time{font-size:.8rem;color:var(--muted)}
.k-ghost-home{background:transparent;border-style:dashed;position:relative}
.post article img{max-width:100%;border-radius:8px}
.post figure{margin:16px 0}
.video{position:relative;aspect-ratio:16/9}
.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px}
.site-footer{margin-top:24px;color:var(--muted);font-size:.9rem;text-align:center}
.webring a{margin:0 6px}
.ghost{position:relative;width:56px;height:64px;border:0;border-radius:28px 28px 10px 10px;cursor:pointer;animation:ghost-bob 3s ease-in-out infinite}
.ghost-white{background:#fbfbff}.ghost-mint{background:#c9f2df}.ghost-peach{background:#ffd9c4}.ghost-lilac{background:#e3d6ff}
.ghost-bubble{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:8px 12px;margin-top:8px;font-size:.9rem}
.ghost-bubble p{margin:0 0 4px}
@keyframes ghost-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@media (prefers-reduced-motion:reduce){.ghost{animation:none}}
`

function renderCss(pub: Project): string {
  const rules = pub.blocks
    .map((b) => `.b-${b.id}{grid-column:${b.x + 1} / span ${b.w};grid-row:${b.y + 1} / span ${b.h}}`)
    .join('\n')
  return `${themeCss(pub.site.theme)}\n${BASE_CSS}${rules}\n`
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
