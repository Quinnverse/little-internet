/**
 * Styles for the visitor's 3D room overlay. They live in the generated style.css (the page's CSP
 * allows no inline styles). Everything is scoped under .li-room so themes cannot leak in.
 */
export const ROOM_CSS = `html.li-lock,html.li-lock body{overflow:hidden}
.li-room{position:fixed;inset:0;z-index:100;color:#3a2a20;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif;-webkit-text-size-adjust:100%}
.li-room *{box-sizing:border-box}
.li-stage{position:absolute;inset:0;overflow:hidden;background:linear-gradient(180deg,#bfe3ff 0%,#e8f1ef 45%,#fdecd2 100%);transition:background .8s ease}
.li-stage.is-night{background:radial-gradient(1.5px 1.5px at 12% 18%,#fff8 50%,transparent 52%),radial-gradient(1px 1px at 78% 12%,#fff8 50%,transparent 52%),radial-gradient(1.5px 1.5px at 62% 30%,#fff6 50%,transparent 52%),linear-gradient(180deg,#121a3a 0%,#2a2a5a 55%,#4a3a63 100%)}
.li-room .room-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
.li-room .hotspot{position:absolute;left:0;top:0;z-index:3;padding:5px;border:0;background:transparent;will-change:transform;font:inherit;color:inherit;cursor:pointer}
.li-room .hot-dot{position:relative;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:rgba(255,250,240,.95);color:#d9663f;box-shadow:0 2px 8px rgba(40,20,10,.3),0 0 0 2px rgba(255,255,255,.7);transition:transform .15s ease}
.li-room .hot-dot::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(255,250,240,.9);opacity:0;animation:li-pulse 2.6s ease-out infinite}
@keyframes li-pulse{0%{transform:scale(.8);opacity:.9}70%,100%{transform:scale(1.5);opacity:0}}
.li-room .hotspot:hover .hot-dot,.li-room .hotspot:focus-visible .hot-dot{transform:scale(1.14)}
.li-room .hotspot-small .hot-dot{width:16px;height:16px}
.li-room .hot-tip{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:-2px;padding:3px 10px;border-radius:999px;background:rgba(58,42,32,.92);color:#fff7ea;font-size:12px;font-weight:600;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .15s ease}
.li-room .hotspot[data-tip=left] .hot-tip{top:50%;left:auto;right:100%;transform:translateY(-50%);margin:0 -2px 0 0}
.li-room .hotspot[data-tip=top] .hot-tip{top:auto;bottom:100%;margin:0 0 -2px}
.li-room .hotspot:hover .hot-tip,.li-room .hotspot:focus-visible .hot-tip,.li-room.li-labels .hotspot:not(.hotspot-small) .hot-tip{opacity:1}
.li-room .icon{flex:none}
.li-top{position:absolute;z-index:6;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:calc(14px + env(safe-area-inset-top,0px)) 16px 0;pointer-events:none}
.li-title{margin:0;padding:6px 14px;border-radius:999px;background:rgba(255,250,240,.82);backdrop-filter:blur(6px);font:700 1.2rem/1.2 "Iowan Old Style","Palatino Linotype",Palatino,"Noto Serif SC","Songti SC",Georgia,serif;color:#4a3224;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.li-stage.is-night~.li-top .li-title{background:rgba(40,30,50,.7);color:#fbefd8}
.li-actions{display:flex;gap:8px;pointer-events:auto}
.li-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 18px;border-radius:999px;border:1.5px solid rgba(255,255,255,.7);background:rgba(255,250,240,.92);color:#3a2a20;font:600 .95rem/1 inherit;font-family:inherit;cursor:pointer;box-shadow:0 2px 10px rgba(60,35,20,.18);text-decoration:none}
.li-btn:focus-visible{outline:3px solid #d9663f;outline-offset:2px}
.li-btn-primary{background:#d9663f;color:#fff;border-color:#d9663f;box-shadow:0 3px 0 #9a4526;min-height:50px;padding:0 26px}
.li-btn:disabled{opacity:.5}
.li-intro{position:absolute;z-index:5;left:50%;bottom:calc(28px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(92vw,420px);text-align:center;padding:18px 18px 16px;border-radius:26px;background:rgba(255,250,240,.94);box-shadow:0 14px 40px rgba(60,35,20,.3)}
.li-intro small{display:block;color:#86705c;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:.72rem}
.li-intro h2{margin:2px 0 4px;font:700 1.6rem/1.2 "Iowan Old Style","Palatino Linotype",Palatino,"Noto Serif SC","Songti SC",Georgia,serif}
.li-intro p{margin:0 0 12px;color:#86705c}
.li-intro .li-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.li-hint{position:absolute;z-index:4;left:0;right:0;bottom:calc(18px + env(safe-area-inset-bottom,0px));margin:0;text-align:center;font-size:.8rem;color:#5a4332;pointer-events:none}
.li-stage.is-night~.li-hint{color:#e8d8bd}
.li-card{position:absolute;z-index:7;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(94vw,440px);max-height:62dvh;overflow:auto;padding:14px 16px;border-radius:24px;background:rgba(255,250,240,.96);box-shadow:0 14px 40px rgba(60,35,20,.32)}
.li-card h3{margin:0 0 4px;font:700 1.1rem/1.2 "Iowan Old Style","Palatino Linotype",Palatino,"Noto Serif SC","Songti SC",Georgia,serif}
.li-card p{margin:0 0 8px;color:#6a5440}
.li-card .li-close{position:absolute;top:8px;right:8px;width:40px;height:40px;padding:0;min-height:0;border:0;background:transparent;box-shadow:none}
.li-card ul{list-style:none;margin:0;padding:0}
.li-card li a{display:flex;justify-content:space-between;gap:8px;padding:10px 4px;border-bottom:1px solid #e8d8bd;color:#3a2a20;text-decoration:none;min-height:44px;align-items:center}
.li-card li a span{color:#86705c;font-size:.8rem;flex:none}
.li-card audio{width:100%;margin:6px 0 0}
.li-form{display:grid;gap:8px}
.li-form input,.li-form textarea{font:inherit;width:100%;min-height:44px;padding:10px 12px;border:1.5px solid #e8d8bd;border-radius:12px;background:#fff;color:#3a2a20}
.li-form textarea{min-height:80px;resize:vertical}
.li-form .li-trap{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.li-note{margin:8px 0 0;font-size:.9rem}
.li-msgs{margin:8px 0}
.li-msgs p{margin:0;padding:6px 0;border-top:1px dashed #e8d8bd;overflow-wrap:anywhere;white-space:pre-wrap}
.li-fade{position:absolute;inset:0;z-index:9;background:#2a1d14;opacity:0;pointer-events:none;transition:opacity .45s ease}
.li-fade.on{opacity:1;pointer-events:auto}
.li-room .li-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (prefers-reduced-motion:reduce){.li-room .hot-dot::after{animation:none}.li-fade{transition:none}}
`
