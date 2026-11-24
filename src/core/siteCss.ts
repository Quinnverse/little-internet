import { FONT_STACKS, pageWidgets, type DividerId, type PatternId, type SiteDesign, type ThemeTokens } from './design.ts'
import { ROOM_CSS } from './roomCss.ts'
import { assetPath, type Project } from './schema.ts'

/**
 * style.css for a design. Every value placed in CSS comes from an enum, a validated #rrggbb colour,
 * a bounded integer, or a validated id, so owner input cannot break out of a declaration.
 * Layout is a CSS grid: N columns on wide screens, 2 on phones. No absolute positioning.
 */
export function designCss(pub: Project, url: (path: string) => string): string {
  const d = pub.web.draft
  const t = d.tokens
  const bgAsset = t.bgAssetId ? pub.assets.find((a) => a.id === t.bgAssetId) : undefined
  const bgImage = bgAsset ? `url("${url(assetPath(bgAsset.id, bgAsset.mime))}")` : ''
  return [vars(t), background(t, bgImage), BASE, LOOKS, DIVIDER_CSS, GHOST_CSS, widgetRules(d), ROOM_CSS].join('\n')
}

const WIDTH = { narrow: 700, normal: 980, wide: 1220 }
const enc = (c: string) => c.replace('#', '%23')

function vars(t: ThemeTokens): string {
  const shadow = t.shadow === 'soft' ? '0 6px 18px rgba(0,0,0,.14)' : t.shadow === 'hard' ? '4px 4px 0 rgba(0,0,0,.55)' : 'none'
  const borderStyle =
    t.border === 'window' ? 'outset' : t.border === 'pixel' ? 'solid' : t.border === 'none' ? 'none' : t.border
  return `:root{--bg:${t.bg};--fg:${t.text};--muted:${t.muted};--accent:${t.accent};--link:${t.link};--panel:${t.panel};--panel-fg:${t.panelText};--pattern:${t.patternColor};--hfont:${FONT_STACKS[t.headingFont]};--font:${FONT_STACKS[t.bodyFont]};--size:${t.baseSize}px;--bw:${t.border === 'none' ? 0 : t.borderWidth}px;--bs:${borderStyle};--bc:${t.borderColor};--radius:${t.radius}px;--shadow:${shadow};--maxw:${WIDTH[t.width]}px;--title:${t.titleSize}px;--halign:${t.headerAlign}}`
}

function patternImage(p: PatternId, c: string): string {
  switch (p) {
    case 'none':
      return ''
    case 'stars':
      return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' shape-rendering='crispEdges'%3E%3Cg fill='${enc(c)}'%3E%3Crect x='10' y='8' width='2' height='2'/%3E%3Crect x='9' y='9' width='4' height='1' opacity='.6'/%3E%3Crect x='44' y='20' width='1' height='1'/%3E%3Crect x='30' y='40' width='2' height='2'/%3E%3Crect x='54' y='52' width='1' height='1'/%3E%3Crect x='18' y='54' width='1' height='1'/%3E%3Crect x='52' y='4' width='1' height='1' opacity='.7'/%3E%3C/g%3E%3C/svg%3E")`
    case 'dots':
      return `radial-gradient(${c} 1.6px, transparent 1.8px)`
    case 'grid':
      return `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`
    case 'checker':
      return `conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0)`
    case 'stripes':
      return `repeating-linear-gradient(45deg, ${c} 0 10px, transparent 10px 22px)`
    case 'hearts':
      return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Cpath fill='${enc(c)}' d='M12 18c-3-3-8-1-8 3 0 4 8 8 8 8s8-4 8-8c0-4-5-6-8-3z'/%3E%3Cpath fill='${enc(c)}' d='M36 42c-2-2-6-1-6 2s6 6 6 6 6-3 6-6-4-4-6-2z' opacity='.7'/%3E%3C/svg%3E")`
    case 'paper':
      return `repeating-linear-gradient(0deg, transparent 0 27px, ${c} 27px 28px)`
    case 'waves':
      return `radial-gradient(circle at 50% 100%, transparent 9px, ${c} 10px 12px, transparent 13px)`
    case 'sparkle':
      return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath fill='${enc(c)}' d='M20 10l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'/%3E%3Cpath fill='${enc(c)}' d='M60 48l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z' opacity='.7'/%3E%3C/svg%3E")`
  }
}

const PATTERN_SIZE: Record<PatternId, string> = {
  none: 'auto',
  stars: '64px 64px',
  dots: '18px 18px',
  grid: '24px 24px',
  checker: '32px 32px',
  stripes: 'auto',
  hearts: '48px 48px',
  paper: 'auto',
  waves: '28px 14px',
  sparkle: '80px 80px',
}

function background(t: ThemeTokens, bgImage: string): string {
  const pattern = patternImage(t.pattern, t.patternColor)
  const layers = [bgImage, pattern].filter(Boolean)
  if (!layers.length) return 'body{background:var(--bg)}'
  const sizes = [bgImage ? (t.bgFit === 'cover' ? 'cover' : 'auto') : '', pattern ? PATTERN_SIZE[t.pattern] : ''].filter(Boolean)
  const repeat = [bgImage ? (t.bgFit === 'cover' ? 'no-repeat' : 'repeat') : '', pattern ? 'repeat' : ''].filter(Boolean)
  const attach = bgImage && t.bgFit === 'cover' ? ';background-attachment:fixed' : ''
  return `body{background-color:var(--bg);background-image:${layers.join(',')};background-size:${sizes.join(',')};background-repeat:${repeat.join(',')}${attach}}`
}

const BASE = `*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;color:var(--fg);font-family:var(--font);font-size:var(--size);line-height:1.55;overflow-wrap:anywhere}
a{color:var(--link)}
img{max-width:100%}
.wrap{max-width:var(--maxw);margin:0 auto;padding:20px 16px 32px}
.site-header{text-align:var(--halign);margin-bottom:18px}
.site-title{font-family:var(--hfont);font-size:clamp(24px,7vw,var(--title));line-height:1.1;font-weight:700;margin:0}
.site-title a{color:var(--fg);text-decoration:none}
.tagline{color:var(--muted);margin:6px 0 0}
.welcome-banner{margin:12px 0 0;padding:6px 12px;border:1px dashed var(--accent);color:var(--accent);font-weight:700;overflow:hidden;white-space:nowrap}
.welcome-banner span{display:inline-block;padding-left:100%;animation:li-marquee 16s linear infinite}
@keyframes li-marquee{to{transform:translateX(-100%)}}
.site-nav{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;justify-content:var(--halign)}
.site-nav{font-family:var(--hfont)}
.site-nav a{padding:6px 2px;font-weight:700}
.site-nav a[aria-current=page]{text-decoration:underline wavy var(--accent);text-underline-offset:5px}
.muted,.date{color:var(--muted)}
.small{font-size:.85em}
.page-grid{display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:14px;align-items:start}
.cols-1{--cols:1}.cols-2{--cols:2}.cols-3{--cols:3}.cols-4{--cols:4}
.w{min-width:0;grid-column:span 1}
.w h2{font-family:var(--hfont);font-size:1.2em;line-height:1.2;margin:0 0 8px}
.w p{margin:0 0 8px}
.w p:last-child{margin-bottom:0}
.w ul{margin:0;padding:0;list-style:none}
.entries li{padding:6px 0;border-top:1px dashed color-mix(in srgb,currentColor 25%,transparent)}
.entries li:first-child{border-top:0}
.entry{display:block;color:inherit;text-decoration:none}
.entry img{width:100%;max-height:180px;object-fit:cover;display:block;margin-bottom:6px;border-radius:calc(var(--radius) / 2)}
.entry-title{display:block;font-weight:700;color:var(--link)}
.entry time,.gb-list time{font-size:.8em;opacity:.75}
.entry p{margin:4px 0 0;opacity:.85}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
.gallery img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.books li{padding:6px 0 6px 12px;border-left:4px solid var(--accent);margin:6px 0}
.book-title{display:block;font-weight:700}
.book-author,.book-note{display:block;font-size:.88em;opacity:.8}
.keepsakes li{margin:6px 0}
.keepsakes a{display:block;color:inherit;text-decoration:none}
.keepsake-kind{display:inline-block;font-size:.72em;text-transform:uppercase;letter-spacing:.08em;padding:1px 6px;border:1px solid currentColor;border-radius:99px;margin-right:6px;opacity:.75}
.w audio{width:100%;height:40px}
.rec-meta{font-size:.85em;opacity:.8}
.about-photo{float:right;width:38%;max-width:180px;margin:0 0 8px 12px;border-radius:var(--radius)}
.gb-form{display:grid;gap:6px;margin:8px 0}
.gb-form input,.gb-form textarea{font:inherit;padding:8px;border:1px solid color-mix(in srgb,currentColor 40%,transparent);border-radius:4px;background:rgba(255,255,255,.9);color:#222;min-height:44px}
.gb-form textarea{min-height:80px}
.gb-form button,.copy-btn,.ring-btn{font:inherit;font-weight:700;min-height:44px;padding:8px 14px;border:2px outset #ddd;background:#efefef;color:#111;cursor:pointer;border-radius:3px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.gb-trap{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.gb-list li{padding:8px 0;border-top:1px dotted color-mix(in srgb,currentColor 30%,transparent)}
.gb-list li:first-child{border-top:0}
.links-list li{margin:4px 0}
.links-buttons{display:flex;flex-wrap:wrap;gap:6px}
.badge88{display:inline-block;width:88px;height:31px;image-rendering:pixelated;vertical-align:middle}
.badge-text{display:inline-flex;align-items:center;justify-content:center;font:700 10px/1.05 Verdana,Tahoma,sans-serif;text-transform:uppercase;text-align:center;padding:2px;border:2px outset #bbb;background:linear-gradient(#3b3bb0,#121260);color:#fff;overflow:hidden}
.ring{display:flex;flex-wrap:wrap;gap:6px}
.badge-code{width:100%;font:12px/1.35 ui-monospace,"Courier New",monospace;padding:6px;border:1px solid #999;background:#fff;color:#222;resize:vertical}
.sticker{display:flex;justify-content:var(--j,center)}
.sticker svg,.sticker img{display:block;image-rendering:pixelated}
.size-s svg,.size-s img{width:40px;height:40px}.size-m svg,.size-m img{width:72px;height:72px}.size-l svg,.size-l img{width:120px;height:120px}
.sticker img{object-fit:contain;height:auto}
.motion-bob svg,.motion-bob img{animation:li-bob 2.4s ease-in-out infinite}
.motion-spin svg,.motion-spin img{animation:li-spin 6s linear infinite}
.motion-blink svg,.motion-blink img{animation:li-blink 1.2s steps(2,end) infinite}
@keyframes li-bob{50%{transform:translateY(-6px)}}
@keyframes li-spin{to{transform:rotate(360deg)}}
@keyframes li-blink{50%{opacity:.25}}
.construction{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px;background:repeating-linear-gradient(-45deg,#ffd400 0 12px,#1a1a1a 12px 24px);color:#1a1a1a;font:700 .85em/1.2 Verdana,Tahoma,sans-serif;text-transform:uppercase;text-align:center}
.construction span{background:#ffd400;padding:4px 8px;border:2px solid #1a1a1a}
.construction svg{width:30px;height:30px;flex:none}
.ghost-home{display:grid;place-items:center;min-height:96px;position:relative;overflow:visible;z-index:3}
.px-boo{width:64px;height:64px;animation:li-bob 3s ease-in-out infinite}
figure{margin:0}
figure img{display:block;width:100%;height:auto;border-radius:var(--radius)}
figcaption{font-size:.85em;opacity:.8;margin-top:6px}
.post{background:var(--panel);color:var(--panel-fg);padding:20px;border:var(--bw) var(--bs) var(--bc);border-radius:var(--radius);box-shadow:var(--shadow)}
.post h1{font-family:var(--hfont);margin:0 0 4px;line-height:1.15}
.post article img{max-width:100%;border-radius:var(--radius)}
.post figure{margin:16px 0}
.back{margin:0 0 12px}
.back a{color:var(--link)}
.video{position:relative;aspect-ratio:16/9}
.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.site-footer{margin-top:28px;color:var(--muted);font-size:.9em;text-align:center}
.webring a{margin:0 6px}
@media (max-width:640px){.page-grid{--cols:2!important;gap:12px}.wrap{padding:14px 12px 28px}.about-photo{width:42%}}
@media (prefers-reduced-motion:reduce){.welcome-banner span{animation:none;padding-left:0}.motion-bob svg,.motion-bob img,.motion-spin svg,.motion-spin img,.motion-blink svg,.motion-blink img,.px-boo{animation:none}}
`

/** Component looks. Each sets its own readable foreground for its own background. */
const LOOKS = `.look-panel{background:var(--panel);color:var(--panel-fg);padding:14px;border:var(--bw) var(--bs) var(--bc);border-radius:var(--radius);box-shadow:var(--shadow)}
.look-panel a{color:var(--accent)}
.look-plain{padding:4px 2px;background:transparent}
.look-note{background:#fff4a3;color:#3a3220;padding:14px 14px 16px;box-shadow:2px 5px 10px rgba(60,45,10,.25);border-radius:2px}
.look-note a{color:#8a3b1f}
.look-polaroid{background:#fffdf8;color:#2b2622;padding:10px 10px 22px;box-shadow:0 6px 14px rgba(0,0,0,.22);border-radius:2px}
.look-polaroid a{color:#8a3b1f}
.look-tape{position:relative;background:var(--panel);color:var(--panel-fg);padding:20px 14px 14px;box-shadow:0 4px 12px rgba(60,40,20,.18);border-radius:2px}
.look-tape::before{content:"";position:absolute;top:-10px;left:50%;width:96px;height:22px;margin-left:-48px;background:rgba(255,226,150,.75);box-shadow:0 1px 2px rgba(0,0,0,.12);transform:rotate(-3deg)}
.look-tape a{color:var(--accent)}
.look-window{background:#c0c0c0;color:#111;padding:0 0 10px;border:3px outset #f4f4f4;box-shadow:var(--shadow)}
.look-window>h2{margin:0 0 8px;padding:4px 8px;background:linear-gradient(90deg,#0a1a8a,#3a7bd5);color:#fff;font:700 .95em/1.3 Verdana,Tahoma,sans-serif}
.look-window>:not(h2){margin-left:10px;margin-right:10px}
.look-window>:first-child:not(h2){margin-top:10px}
.look-window a{color:#0000ee}
.look-window a:visited{color:#551a8b}
.look-letter{background:repeating-linear-gradient(#fffdf5 0 25px,#d6e4f0 25px 26px);color:#2b2a33;padding:16px 16px 16px 40px;border-left:2px solid #f2a7a7;box-shadow:0 5px 14px rgba(0,0,0,.15);background-clip:padding-box}
.look-letter a{color:#9a3324}
.look-note.t-sticker,.look-plain.t-sticker{background:transparent;box-shadow:none}
`

const DIVIDER_CSS = `.divider{height:16px;width:100%}
${(['line', 'dots', 'stars', 'hearts', 'zigzag', 'flowers', 'rainbow'] as DividerId[]).map(dividerRule).join('\n')}
`

function dividerRule(p: DividerId): string {
  switch (p) {
    case 'line':
      return '.dv-line{height:1px;background:var(--accent);opacity:.6;margin:8px 0}'
    case 'dots':
      return '.dv-dots{background:radial-gradient(circle,var(--accent) 2.5px,transparent 3px) 0 50%/16px 16px repeat-x}'
    case 'stars':
      return `.dv-stars{height:18px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='18'%3E%3Cpath fill='%23ffd23f' stroke='%232b2140' stroke-width='.8' d='M12 2l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 7.3l5-.7z'/%3E%3C/svg%3E") 0 0/24px 18px repeat-x}`
    case 'hearts':
      return `.dv-hearts{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='16'%3E%3Cpath fill='%23ff4f7b' d='M11 14S3 9.5 3 5.5C3 3 5 1.5 7 1.5c1.7 0 3 1 4 2.4 1-1.4 2.3-2.4 4-2.4 2 0 4 1.5 4 4 0 4-8 8.5-8 8.5z'/%3E%3C/svg%3E") 0 0/22px 16px repeat-x}`
    case 'zigzag':
      return '.dv-zigzag{height:12px;background:linear-gradient(135deg,var(--accent) 25%,transparent 25%) -6px 0/12px 12px,linear-gradient(225deg,var(--accent) 25%,transparent 25%) -6px 0/12px 12px;opacity:.85}'
    case 'flowers':
      return `.dv-flowers{height:20px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='20'%3E%3Cg fill='%23ff8fb1'%3E%3Ccircle cx='10' cy='6' r='3'/%3E%3Ccircle cx='14' cy='10' r='3'/%3E%3Ccircle cx='10' cy='14' r='3'/%3E%3Ccircle cx='6' cy='10' r='3'/%3E%3C/g%3E%3Ccircle cx='10' cy='10' r='2.2' fill='%23ffd23f'/%3E%3Cpath d='M22 10h14' stroke='%234caf50' stroke-width='2' stroke-dasharray='3 3'/%3E%3C/svg%3E") 0 0/40px 20px repeat-x}`
    case 'rainbow':
      return '.dv-rainbow{height:8px;background:linear-gradient(90deg,#ff3b3b,#ff9f1a,#ffe11a,#3bd16f,#2f8cff,#8a4dff,#ff3bd1);border-radius:4px}'
  }
}

/** The website ghost (ghost.js) reuses these classes. */
const GHOST_CSS = `.ghost-wrap{position:relative;display:inline-block}
.ghost-floating{position:fixed;right:16px;bottom:16px;z-index:20}
.ghost{display:block;width:60px;height:68px;padding:0;border:0;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ghost:focus-visible{outline:3px solid var(--accent);outline-offset:4px;border-radius:30px}
.ghost svg{width:100%;height:100%;overflow:visible;filter:drop-shadow(0 4px 6px rgba(0,0,0,.25))}
.g-body{stroke:#2b2140;stroke-width:2}
.ghost-white .g-body{fill:#fbfbff}.ghost-mint .g-body{fill:#c9f2df}.ghost-peach .g-body{fill:#ffd9c4}.ghost-lilac .g-body{fill:#e3d6ff}
.g-eyes-open,.g-mouth{fill:#2b2140}
.g-eyes-closed{display:none;fill:none;stroke:#2b2140;stroke-width:2.4;stroke-linecap:round}
.g-z{opacity:0;fill:#2b2140;font:700 14px/1 system-ui,sans-serif}
[data-state=idle] .ghost{animation:ghost-float 4s ease-in-out infinite}
[data-state=sleep] .ghost{animation:ghost-float 7s ease-in-out infinite}
[data-state=sleep] .g-eyes-open,[data-state=sleep] .g-mouth{display:none}
[data-state=sleep] .g-eyes-closed{display:inline}
[data-state=sleep] .g-z{animation:ghost-z 2.4s ease-in-out infinite}
[data-state=react] .ghost{animation:ghost-jump .7s ease-out 2}
[data-state=guide] .ghost{transform:scale(1.06)}
.ghost-bubble{position:absolute;bottom:calc(100% + 10px);left:50%;margin-left:-110px;width:220px;background:#fffdf7;color:#2b2622;border:1px solid #d9cdb8;border-radius:14px;padding:10px 12px;font:15px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:30;text-align:left}
.ghost-bubble a{color:#a8473a}
.ghost-floating .ghost-bubble{left:auto;right:0;margin-left:0}
.ghost-below .ghost-bubble{bottom:auto;top:calc(100% + 10px)}
.ghost-bubble p{margin:0 0 6px}
.ghost-bubble ul{margin:0;padding-left:1.1em;list-style:disc}
.ghost-bubble li{margin:4px 0}
.ghost-bubble a{display:inline-block;padding:2px 0}
@keyframes ghost-float{0%,100%{transform:translate(0,0)}25%{transform:translate(3px,-5px)}50%{transform:translate(0,-8px)}75%{transform:translate(-3px,-4px)}}
@keyframes ghost-jump{0%,100%{transform:translateY(0)}40%{transform:translateY(-18px)}}
@keyframes ghost-z{0%{opacity:0;transform:translate(0,4px)}50%{opacity:1}100%{opacity:0;transform:translate(6px,-8px)}}
@media (prefers-reduced-motion:reduce){.ghost,.g-z{animation:none!important}[data-state=sleep] .g-z{opacity:1}}
`

function widgetRules(d: SiteDesign): string {
  const wide: string[] = []
  const phone: string[] = []
  const desk: string[] = []
  for (const page of d.pages) {
    for (const w of pageWidgets(d, page.id)) {
      const sel = `.w-${w.id}`
      const span = Math.min(w.layout.span, page.columns)
      const decl = [`grid-column:span ${span}`]
      if (w.style.bg) decl.push(`background:${w.style.bg}`)
      if (w.style.fg) decl.push(`color:${w.style.fg}`)
      if (w.style.tilt) decl.push(`transform:rotate(${w.style.tilt * 0.8}deg)`)
      if (w.layout.align !== 'left') decl.push(`text-align:${w.layout.align}`, `--j:${w.layout.align === 'center' ? 'center' : 'flex-end'}`)
      else decl.push('--j:flex-start')
      wide.push(`${sel}{${decl.join(';')}}`)
      if (w.style.fg) wide.push(`${sel} a,${sel} h2{color:inherit}`)
      if (w.layout.mobile === 'hide') phone.push(`${sel}{display:none}`)
      else phone.push(`${sel}{grid-column:span ${w.layout.mobile === 'half' ? 1 : 2}}`)
      if (w.layout.desktop === 'hide') desk.push(`${sel}{display:none}`)
    }
  }
  return [
    wide.join('\n'),
    phone.length ? `@media (max-width:640px){${phone.join('')}}` : '',
    desk.length ? `@media (min-width:641px){${desk.join('')}}` : '',
  ].join('\n')
}
