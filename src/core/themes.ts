import type { Theme } from './schema.ts'

type ThemeVars = {
  bg: string
  fg: string
  muted: string
  card: string
  border: string
  accent: string
  font: string
}

export const THEME_VARS: Record<Theme, ThemeVars> = {
  paper: {
    bg: '#f6f0e4',
    fg: '#2b2620',
    muted: '#7a6f60',
    card: '#fffaf0',
    border: '#d9cdb8',
    accent: '#c2562c',
    font: 'Georgia, "Times New Roman", serif',
  },
  midnight: {
    bg: '#14111f',
    fg: '#ece8f6',
    muted: '#9a90b5',
    card: '#1f1a30',
    border: '#3a3157',
    accent: '#f28c38',
    font: '"Trebuchet MS", system-ui, sans-serif',
  },
  room: {
    bg: '#e6d3b3',
    fg: '#3b2a1e',
    muted: '#7d6450',
    card: '#fbf3e4',
    border: '#8a6a4a',
    accent: '#a8473a',
    font: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  },
}

export function themeCss(theme: Theme): string {
  const v = THEME_VARS[theme]
  return `:root{--bg:${v.bg};--fg:${v.fg};--muted:${v.muted};--card:${v.card};--border:${v.border};--accent:${v.accent};--font:${v.font}}`
}

/**
 * The "room" skin: same grid and data, dressed as a little room. Diary entries become
 * notebooks, photos hang in frames, friends sit on a bookshelf, the voice block is an
 * answering machine. Gradients only: no images, so nothing extra to ship or load.
 */
const ROOM_CSS = `body.theme-room{background:repeating-linear-gradient(90deg,#ead9bc 0 26px,#e5d2b2 26px 52px)}
body.theme-room::after{content:"";position:fixed;left:0;right:0;bottom:0;height:44px;z-index:-1;background:repeating-linear-gradient(90deg,#8a5a34 0 70px,#7a4d2b 70px 72px);box-shadow:0 -6px 0 #5e3a1f}
.theme-room .site-title a{color:var(--fg)}
.theme-room .wrap{padding-bottom:68px}
.theme-room .site-footer{color:#3b2a1e}
.theme-room .site-footer p,.theme-room .webring{display:inline-block;background:rgba(251,243,228,.92);border-radius:999px;padding:4px 14px;margin:0 0 6px}
.theme-room .site-footer a{color:#7d2f25}
.theme-room .block{background:transparent;border:0;border-radius:0;padding:0;box-shadow:none}
.theme-room .block h2{font-size:1rem}
.theme-room .k-post{background:repeating-linear-gradient(#f8efd9 0 23px,#dfe3ea 23px 24px);border-left:12px solid #7a3b2e;border-radius:3px 9px 9px 3px;box-shadow:3px 4px 0 rgba(60,35,20,.3);padding:8px 10px}
.theme-room .k-post .card{color:var(--fg)}
.theme-room .k-post .card img{border-radius:2px}
.theme-room .k-image{border:10px solid #6b4423;outline:3px solid #e7c98b;outline-offset:-13px;background:#fff;box-shadow:3px 5px 10px rgba(40,25,10,.35)}
.theme-room .k-links{background:linear-gradient(#7b4e2a,#6a421f);border-bottom:8px solid #4f3017;border-radius:4px 4px 0 0;padding:8px 10px 0;box-shadow:inset 0 3px 6px rgba(0,0,0,.35)}
.theme-room .k-links h2{color:#f3e3c6}
.theme-room .k-links .muted{color:#e4cfa6}
.theme-room .k-links ul{list-style:none;display:flex;flex-wrap:wrap;align-items:flex-end;gap:3px;padding:0}
.theme-room .k-links li{border-radius:2px 2px 0 0;padding:6px 8px;background:#a8473a;box-shadow:inset -3px 0 0 rgba(0,0,0,.2)}
.theme-room .k-links li:nth-child(4n+2){background:#3f6b57;height:2.3rem}
.theme-room .k-links li:nth-child(4n+3){background:#c9962f;height:2.6rem}
.theme-room .k-links li:nth-child(4n+4){background:#46557f}
.theme-room .k-links li a{color:#fff7e6;text-decoration:none;font-size:.85rem}
.theme-room .k-voice{background:#2f2a28;color:#f0e6d2;border-radius:12px 12px 6px 6px;border-bottom:7px solid #1c1817;padding:10px 12px;box-shadow:3px 4px 0 rgba(0,0,0,.3)}
.theme-room .k-voice h2::before{content:"";display:inline-block;width:9px;height:9px;margin-right:8px;border-radius:50%;background:#d8402f;box-shadow:0 0 6px #d8402f}
.theme-room .k-voice .rec-meta,.theme-room .k-voice .muted{color:#bba98f}
.theme-room .voice li{border-color:#4a413c}
.theme-room .k-ghost-home{background:radial-gradient(ellipse at center,#a8473a 0 52%,#e7c98b 53% 56%,#7d3329 57% 66%,transparent 67%)}
.theme-room .k-latest{background:#c79a63;border:6px solid #7a4f26;border-radius:4px;padding:8px 10px;box-shadow:3px 4px 0 rgba(60,35,20,.3)}
.theme-room .k-latest a{color:#3b2a1e}
.theme-room .k-text{background:#fff1a0;transform:rotate(-1.4deg);padding:10px 12px;box-shadow:2px 4px 6px rgba(60,35,20,.3);border-radius:2px}
.theme-room .post article{background:repeating-linear-gradient(#f8efd9 0 27px,#dfe3ea 27px 28px);border-left:14px solid #7a3b2e;border-radius:3px 10px 10px 3px;padding:12px 18px;box-shadow:3px 4px 0 rgba(60,35,20,.3)}
.theme-room .post figure img{border:8px solid #6b4423;border-radius:0;box-sizing:border-box}
.theme-room .site-header{border-bottom-color:#8a6a4a}
.theme-room .site-title{letter-spacing:.01em}
/* A room you can feel: a subtle wall-panel behind the centred grid on wide screens. */
@media (min-width:760px){
  body.theme-room{background:repeating-linear-gradient(90deg,#e7d5b6 0 34px,#e2cdaa 34px 68px)}
  .theme-room .wrap{background:repeating-linear-gradient(90deg,#eddfc5 0 26px,#e8d6b5 26px 52px);border-left:2px solid #c9ad86;border-right:2px solid #c9ad86;border-radius:6px 6px 0 0;padding-left:22px;padding-right:22px;box-shadow:0 0 0 6px rgba(120,80,45,.08)}
  .theme-room .grid{--gap:14px}
  .theme-room .k-latest,.theme-room .k-post{box-shadow:4px 6px 0 rgba(60,35,20,.34)}
}
@media (prefers-reduced-motion:reduce){.theme-room .k-text{transform:none}}
`

export function themeExtraCss(theme: Theme): string {
  return theme === 'room' ? ROOM_CSS : ''
}
