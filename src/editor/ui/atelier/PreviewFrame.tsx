import { useEffect, useMemo, useRef } from 'preact/hooks'
import { renderPreviewPage } from '../../../core/siteFiles.ts'
import { MIME_EXT, type Project } from '../../../core/schema.ts'
import { blobUrl } from '../common.tsx'

/** Maps site-relative file paths (assets/…, audio/…, button.png) to in-memory blob URLs. */
function urlResolver(p: Project) {
  const assets = new Map(p.assets.map((a) => [`assets/${a.id}.${MIME_EXT[a.mime]}`, a]))
  const recs = new Map(p.recordings.map((r) => [r.id, r]))
  return (path: string) => {
    const a = assets.get(path)
    if (a) return blobUrl(a.data, a.mime)
    const rec = /^audio\/([a-z0-9_-]+)\./.exec(path)
    if (rec) {
      const r = recs.get(rec[1]!)
      if (r) return blobUrl(r.data, r.mime)
    }
    const btn = /^button\.(png|gif|jpg|webp)$/.test(path) && p.web.draft.buttonAssetId
    if (btn) {
      const asset = p.assets.find((x) => x.id === btn)
      if (asset) return blobUrl(asset.data, asset.mime)
    }
    return 'about:blank'
  }
}

const EDITOR_CSS = `[data-w]{cursor:pointer;transition:outline-color .12s}
[data-w]:hover{outline:2px dashed rgba(255,106,61,.7);outline-offset:4px}
[data-w].li-sel{outline:3px solid #ff6a3d;outline-offset:4px}
[data-w].li-sel::after{content:attr(data-label);position:absolute;top:-30px;left:-3px;z-index:9;font:700 11px/1 system-ui,sans-serif;background:#ff6a3d;color:#fff;padding:5px 8px;border-radius:6px 6px 6px 0;white-space:nowrap;pointer-events:none}

a,button,input,textarea{pointer-events:none}
audio{pointer-events:auto}`

/**
 * The live preview: the real page renderer (same as publish/export), inlined into a sandboxed
 * iframe without scripts. Clicking a component selects it in the editor.
 */
export function PreviewFrame(props: {
  project: Project
  pageId: string
  selected: string | null
  labels: Record<string, string>
  device: 'desktop' | 'phone'
  title: string
  onAdjust: (id:string, dx:number, dy:number, resize:boolean, colWidth:number)=>void
  onSelect: (id: string | null) => void
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const scroll = useRef(0)
  const html = useMemo(() => renderPreviewPage(props.project, props.pageId, urlResolver(props.project)), [props.project, props.pageId])
  const onSelect = useRef(props.onSelect)
  onSelect.current = props.onSelect
  const adjust=useRef(props.onAdjust)
  adjust.current=props.onAdjust
  const selectedRef = useRef(props.selected)
  selectedRef.current = props.selected
  const labelsRef = useRef(props.labels)
  labelsRef.current = props.labels

  const mark = (scrollTo: boolean) => {
    const doc = ref.current?.contentDocument
    if (!doc) return
    for (const el of doc.querySelectorAll('[data-w]')) {
      const id = el.getAttribute('data-w')!
      el.setAttribute('data-label', labelsRef.current[id] ?? '')
      el.classList.toggle('li-sel', id === selectedRef.current)
      if (scrollTo && id === selectedRef.current) (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    scroll.current = frame.contentWindow?.scrollY ?? scroll.current
    const onLoad = () => {
      const doc = frame.contentDocument
      if (!doc) return
      const style = doc.createElement('style')
      style.textContent = EDITOR_CSS
      doc.head.append(style)
      if(frame.clientWidth>640){
        for(const widget of doc.querySelectorAll<HTMLElement>('[data-w]')){
          for (const resize of [false,true]){
            const handle=doc.createElement('button')
            handle.textContent=resize?'↔':'✥'
            handle.title=resize?'Resize / 调整宽度':'Move / 移动'
            handle.style.cssText='position:absolute;bottom:4px;'+(resize?'right:4px':'left:4px')+';z-index:30;pointer-events:auto;touch-action:none;cursor:grab'
            if(doc.defaultView?.getComputedStyle(widget).position!=='absolute')widget.style.position='relative'
            widget.append(handle)
            let start:{x:number;y:number}|null=null
            handle.ondragstart=e=>e.preventDefault()
            handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();start={x:e.clientX,y:e.clientY};handle.setPointerCapture(e.pointerId)}
            handle.onpointercancel=()=>{start=null;widget.style.translate=''}
            handle.onpointermove=e=>{if(start&&!resize)widget.style.translate=(e.clientX-start.x)+'px '+(e.clientY-start.y)+'px'}
            handle.onpointerup=e=>{if(!start)return;widget.style.translate='';adjust.current(widget.dataset.w!,e.clientX-start.x,e.clientY-start.y,resize,(widget.parentElement?.clientWidth??640)/Math.max(1,props.project.web.draft.pages.find(p=>p.id===props.pageId)?.columns??1));start=null}
          }
        }
      }
      frame.contentWindow?.scrollTo(0, scroll.current)
      doc.addEventListener(
        'click',
        (e) => {
          const t = e.target as Element | null
          if (t?.closest('audio')) return
          e.preventDefault()
          const w = t?.closest('[data-w]')
          onSelect.current(w ? w.getAttribute('data-w') : null)
        },
        true,
      )
      frame.contentWindow?.addEventListener('scroll', () => (scroll.current = frame.contentWindow?.scrollY ?? 0), { passive: true })
      mark(false)
    }
    frame.addEventListener('load', onLoad, { once: true })
    frame.srcdoc = html
    return () => frame.removeEventListener('load', onLoad)
  }, [html])

  useEffect(() => mark(true), [props.selected, props.labels])

  return (
    <div class={`at-stage at-${props.device}`}>
      <div class="at-device">
        <iframe ref={ref} class="at-frame" title={props.title} sandbox="allow-same-origin" />
      </div>
    </div>
  )
}
