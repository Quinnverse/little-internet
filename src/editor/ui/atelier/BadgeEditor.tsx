import { useEffect, useRef, useState } from 'preact/hooks'
import { BUTTON_ICONS, type WebsiteButton } from '../../../core/design.ts'
import * as D from '../../../core/designOps.ts'
import { SPRITES } from '../../../core/pixels.ts'
import { addAsset, compose, design } from '../../commands.ts'
import { saveBytes } from '../../download.ts'
import { t, useLang } from '../../i18n.ts'
import { ta } from '../../i18nAtelier.ts'
import { randomId } from '../../ids.ts'
import { pickImageFile } from '../../images.ts'
import { siteUrl, savedServer } from '../../publish.ts'
import { Field, type Ctx } from '../common.tsx'
import { Icon } from '../icons.tsx'
import { ColorPick, Seg } from './controls.tsx'
import { lbl } from './labels.ts'

const W = 88
const H = 31

/** Draws a badge on a canvas at real size (88×31), pixel by pixel where it matters. */
export function drawBadge(ctx: CanvasRenderingContext2D, b: WebsiteButton, upload?: ImageBitmap | null): void {
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, W, H)
  if (upload) {
    ctx.drawImage(upload, 0, 0, W, H)
    return
  }
  // background
  if (b.pattern === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, b.bg)
    g.addColorStop(1, b.bg2)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  } else {
    ctx.fillStyle = b.bg
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = b.bg2
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const on =
          b.pattern === 'stripes' ? (x + y) % 6 < 2 : b.pattern === 'checker' ? (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 : b.pattern === 'dots' ? x % 4 === 1 && y % 4 === 1 : false
        if (on) ctx.fillRect(x, y, 1, 1)
      }
    }
  }
  // icon (16×16 sprite at 1:1)
  let textLeft = 4
  if (b.icon !== 'none') {
    const s = SPRITES[b.icon]
    const ox = 4
    const oy = 7
    s.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = s.palette[row[x]!]
        if (!c) continue
        ctx.fillStyle = c
        ctx.fillRect(ox + x, oy + y, 1, 1)
      }
    })
    textLeft = 22
  }
  // text
  ctx.fillStyle = b.textColor
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const cx = textLeft + (W - 3 - textLeft) / 2
  const fit = (text: string, size: number) => {
    let s = size
    ctx.font = `bold ${s}px Verdana, Tahoma, sans-serif`
    while (s > 6 && ctx.measureText(text).width > W - textLeft - 4) {
      s--
      ctx.font = `bold ${s}px Verdana, Tahoma, sans-serif`
    }
  }
  if (b.text2) {
    fit(b.text, 9)
    ctx.fillText(b.text, cx, 10.5)
    fit(b.text2, 8)
    ctx.fillText(b.text2, cx, 21.5)
  } else {
    fit(b.text, 10)
    ctx.fillText(b.text, cx, 16)
  }
  // border
  if (b.border === 'bevel') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, 1)
    ctx.fillRect(0, 0, 1, H)
    ctx.fillStyle = '#404040'
    ctx.fillRect(0, H - 1, W, 1)
    ctx.fillRect(W - 1, 0, 1, H)
    ctx.fillStyle = b.borderColor
    ctx.fillRect(1, 1, W - 2, 1)
    ctx.fillRect(1, 1, 1, H - 2)
  } else if (b.border === 'solid') {
    ctx.fillStyle = b.borderColor
    ctx.fillRect(0, 0, W, 1)
    ctx.fillRect(0, H - 1, W, 1)
    ctx.fillRect(0, 0, 1, H)
    ctx.fillRect(W - 1, 0, 1, H)
  }
}

async function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Could not draw the badge.')
  return new Uint8Array(await blob.arrayBuffer())
}

/** 88×31 badge editor: live preview at 1× and 3×, PNG export, copyable HTML. */
export function BadgeEditor(props: { ctx: Ctx; onClose: () => void }) {
  useLang()
  const { ctx } = props
  const d = ctx.project.web.draft
  const [b, setB] = useState<WebsiteButton>(d.button)
  const [upload, setUpload] = useState<ImageBitmap | null>(null)
  const real = useRef<HTMLCanvasElement>(null)
  const big = useRef<HTMLCanvasElement>(null)
  const set = (patch: Partial<WebsiteButton>) => setB((cur) => ({ ...cur, ...patch }))

  useEffect(() => {
    const c = real.current?.getContext('2d')
    if (!c) return
    drawBadge(c, b, upload)
    const bc = big.current?.getContext('2d')
    if (bc && real.current) {
      bc.imageSmoothingEnabled = false
      bc.clearRect(0, 0, W * 3, H * 3)
      bc.drawImage(real.current, 0, 0, W * 3, H * 3)
    }
  }, [b, upload])

  const pickUpload = async () => {
    const f = await pickImageFile()
    if (!f) return
    try {
      setUpload(await createImageBitmap(f))
    } catch {
      ctx.toast('This file could not be read as an image.', 'error')
    }
  }

  const save = async () => {
    if (!real.current) return
    const data = await canvasPng(real.current)
    const id = randomId()
    const old = d.buttonAssetId
    const r = ctx.apply(
      compose(
        addAsset({ id, mime: 'image/png', data }),
        design((x) => {
          let next = D.addDecoration({ id, kind: 'button', name: 'button.png' })(x)
          next = D.setButton(b, id)(next)
          return old ? D.removeDecoration(old)({ ...next, buttonAssetId: id }) : next
        }),
      ),
    )
    if (!r.ok) return ctx.toast(r.reason, 'error')
    ctx.toast(ta('badge.saved'))
    props.onClose()
  }

  const download = async () => {
    if (!real.current) return
    saveBytes(await canvasPng(real.current), `${ctx.project.site.slug}-88x31.png`, 'image/png')
  }

  const home = siteUrl(ctx.project.site.slug, savedServer())
  const title = ctx.project.site.title.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  const code = `<a href="${home}"><img src="${home}button.png" width="88" height="31" alt="${title}"></a>`

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet sheet-wide" role="dialog" aria-modal="true" aria-label={ta('badge.title')}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="sheet-head">
          <h2>{ta('badge.title')}</h2>
          <button type="button" class="icon-btn" aria-label={t('common.close')} onClick={props.onClose}><Icon name="close" /></button>
        </div>
        <div class="sheet-body badge-editor">
          <div class="badge-previews" aria-label={ta('badge.preview')}>
            <canvas ref={real} width={W} height={H} class="badge-1x" />
            <canvas ref={big} width={W * 3} height={H * 3} class="badge-3x" />
          </div>
          <div class="badge-fields">
            <Field label={ta('badge.text')}>
              <input value={b.text} maxLength={14} onInput={(e) => set({ text: e.currentTarget.value.replace(/[\n\r\t]/g, ' ') })} />
            </Field>
            <Field label={ta('badge.text2')}>
              <input value={b.text2} maxLength={14} onInput={(e) => set({ text2: e.currentTarget.value.replace(/[\n\r\t]/g, ' ') })} />
            </Field>
            <ColorPick label={ta('badge.textColor')} value={b.textColor} onChange={(v) => set({ textColor: v })} />
            <ColorPick label={ta('badge.bg')} value={b.bg} onChange={(v) => set({ bg: v })} />
            <ColorPick label={ta('badge.bg2')} value={b.bg2} onChange={(v) => set({ bg2: v })} />
            <Seg
              label={ta('badge.pattern')}
              value={b.pattern}
              options={(['solid', 'gradient', 'stripes', 'checker', 'dots'] as const).map((x) => [x, ta(`badge.${x}`)] as const)}
              onChange={(v) => set({ pattern: v })}
            />
            <Seg label={ta('badge.border')} value={b.border} options={[['bevel', ta('badge.bevel')], ['solid', lbl('border.solid')], ['none', lbl('border.none')]]} onChange={(v) => set({ border: v })} />
            {b.border !== 'none' && <ColorPick label={ta('st.borderColor')} value={b.borderColor} onChange={(v) => set({ borderColor: v })} />}
            <fieldset class="field">
              <legend class="field-label">{ta('badge.icon')}</legend>
              <div class="seg seg-wrap">
                {BUTTON_ICONS.map((ic) => (
                  <button type="button" key={ic} class={b.icon === ic ? 'on' : ''} aria-pressed={b.icon === ic} onClick={() => set({ icon: ic })}>
                    {lbl(`stk.${ic}`)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div class="choice-row">
              <button type="button" class="btn btn-small" onClick={pickUpload}><Icon name="upload" size={16} /> {ta('badge.upload')}</button>
              {upload && <button type="button" class="btn btn-small" onClick={() => setUpload(null)}>{ta('ed.removeImage')}</button>}
            </div>
          </div>
          <Field label={ta('badge.code')} hint={ta('badge.codeHint')}>
            <textarea readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <div class="sheet-actions">
            <button type="button" class="btn" onClick={download}><Icon name="download" size={18} /> {ta('badge.download')}</button>
            <button type="button" class="btn btn-primary" onClick={save}><Icon name="check" size={18} /> {ta('badge.save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
