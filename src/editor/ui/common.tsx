import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'
import type { Asset, Project, Result } from '../../core/schema.ts'
import type { Command } from '../commands.ts'
import { Icon } from './icons.tsx'

export type Ctx = {
  project: Project
  apply: (cmd: Command) => Result<Project>
  replace: (p: Project) => Result<Project>
  toast: (msg: string, kind?: 'ok' | 'error') => void
}

/** Runs a command and reports a rejection to the owner. Returns true on success. */
export function run(ctx: Ctx, cmd: Command, okMessage?: string): boolean {
  const r = ctx.apply(cmd)
  if (!r.ok) ctx.toast(r.reason, 'error')
  else if (okMessage) ctx.toast(okMessage)
  return r.ok
}

const urlCache = new WeakMap<Uint8Array, string>()

/** Object URL for in-memory bytes, cached per byte array. */
export function blobUrl(data: Uint8Array, mime: string): string {
  let url = urlCache.get(data)
  if (!url) {
    url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
    urlCache.set(data, url)
  }
  return url
}

export function assetUrl(asset: Asset): string {
  return blobUrl(asset.data, asset.mime)
}

export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [props.onClose])
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title}>
        <div class="sheet-head">
          <h2>{props.title}</h2>
          <button type="button" class="icon-btn" aria-label="Close" onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div class="sheet-body">{props.children}</div>
      </div>
    </div>
  )
}

export function Field(props: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span class="field-hint">{props.hint}</span>}
    </label>
  )
}

export function Lock(props: { private: boolean }) {
  return props.private ? (
    <span class="badge badge-private" title="Only you can see this"><Icon name="lock" size={13} /> Private</span>
  ) : (
    <span class="badge badge-public" title="Visitors can see this"><Icon name="open" size={13} /> Public</span>
  )
}

export function GhostIcon(props: { color: string; size?: number }) {
  const fill = { white: '#fbfbff', mint: '#c9f2df', peach: '#ffd9c4', lilac: '#e3d6ff' }[props.color] ?? '#fbfbff'
  const s = props.size ?? 40
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M16 54V28a16 16 0 0 1 32 0v26l-5.3-4-5.4 4-5.3-4-5.3 4-5.4-4z" fill={fill} stroke="#2b2140" stroke-width="2" />
      <circle cx="26" cy="29" r="3" fill="#2b2140" />
      <circle cx="38" cy="29" r="3" fill="#2b2140" />
      <ellipse cx="32" cy="38" rx="3" ry="2.2" fill="#2b2140" />
    </svg>
  )
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
