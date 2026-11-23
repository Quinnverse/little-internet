import { useState } from 'preact/hooks'
import { backupFileName, createBackup } from '../../core/backup.ts'
import { exportSite, siteExportFileName } from '../../core/exportZip.ts'
import { publicProjection } from '../../core/privacy.ts'
import type { Project } from '../../core/schema.ts'
import { addLink, deleteLink, moveLink, normalizeUserUrl, setWebring } from '../commands.ts'
import { saveBytes } from '../download.ts'
import { randomId } from '../ids.ts'
import { Field, run, type Ctx } from './common.tsx'
import { describeProject, pickProjectFile } from './files.ts'
import { Icon } from './icons.tsx'
import { PublishPanel } from './PublishPanel.tsx'

export function Door(props: { ctx: Ctx }) {
  const { ctx } = props
  const p = ctx.project
  const pub = publicProjection(p)
  const privEntries = p.posts.length - pub.posts.length
  const privPhotos = p.assets.length - pub.assets.length

  const downloadSite = () => {
    saveBytes(exportSite(p), siteExportFileName(p))
    ctx.toast('Website downloaded. It contains public content only.')
  }

  const downloadBackup = () => {
    saveBytes(createBackup(p), backupFileName(p))
    ctx.toast('Private backup downloaded. Keep it somewhere safe.')
  }

  const load = async (kind: 'site' | 'backup') => {
    const r = await pickProjectFile(kind)
    if (!r) return
    if (!r.ok) return ctx.toast(r.reason, 'error')
    const msg =
      `Replace your current home (${describeProject(p)}) with ${describeProject(r.value)}?` +
      (kind === 'site' ? '\n\nA website ZIP has no private entries, so private entries on this phone will be lost.' : '')
    if (!confirm(msg)) return
    const done = ctx.replace(r.value)
    ctx.toast(done.ok ? 'Home replaced.' : done.reason, done.ok ? 'ok' : 'error')
  }

  return (
    <section class="screen">
      <div class="screen-head">
        <h1>Door</h1>
      </div>

      <div class="card door-summary">
        <p>
          <strong><Icon name="open" size={16} /> Visitors can see</strong> {pub.posts.length} {pub.posts.length === 1 ? 'entry' : 'entries'} and{' '}
          {pub.assets.length} {pub.assets.length === 1 ? 'photo' : 'photos'}.
        </p>
        <p>
          <strong><Icon name="lock" size={16} /> Only you can see</strong> {privEntries} {privEntries === 1 ? 'entry' : 'entries'} and {privPhotos}{' '}
          {privPhotos === 1 ? 'photo' : 'photos'}.
        </p>
      </div>

      <h2>Take your home with you</h2>
      <div class="card">
        <button type="button" class="btn btn-primary btn-block" onClick={downloadSite}>
          Download website (.zip)
        </button>
        <p class="muted small">
          Public content only. Unzip it onto any static host (GitHub Pages, Cloudflare Pages, Neocities…) and it runs
          without Little Internet. Embedded videos and friend links point to other sites and may change.
        </p>
      </div>
      <div class="card card-warn">
        <button type="button" class="btn btn-block" onClick={downloadBackup}>
          Download private backup
        </button>
        <p class="muted small">
          Everything, including private entries. Browsers can clear data stored on a phone, so keep a backup.{' '}
          <strong>Never upload this file to a website.</strong>
        </p>
      </div>
      <div class="choice-row">
        <button type="button" class="btn" onClick={() => load('backup')}>Restore backup</button>
        <button type="button" class="btn" onClick={() => load('site')}>Import website ZIP</button>
      </div>

      <h2>Open your door online</h2>
      <PublishPanel ctx={ctx} />

      <h2>Friends</h2>
      <Links ctx={ctx} />

      <h2>Webring</h2>
      <Webring ctx={ctx} webring={p.webring} />
    </section>
  )
}

function Links(props: { ctx: Ctx }) {
  const { ctx } = props
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')

  const add = () => {
    const href = normalizeUserUrl(url)
    if (!href) return ctx.toast('That does not look like a web address (example: friend.neocities.org).', 'error')
    const label = title.trim() || new URL(href).hostname
    if (run(ctx, addLink({ id: randomId(), title: label.slice(0, 80), url: href }))) {
      setTitle('')
      setUrl('')
    }
  }

  return (
    <div class="card">
      {ctx.project.links.length === 0 && <p class="muted">No friends yet. Link the personal sites you love.</p>}
      <ul class="link-list">
        {ctx.project.links.map((l, i) => (
          <li key={l.id}>
            <span class="link-text">
              <strong>{l.title}</strong>
              <span class="muted small">{l.url}</span>
            </span>
            <button type="button" class="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => run(ctx, moveLink(l.id, -1))}><Icon name="up" /></button>
            <button type="button" class="icon-btn" aria-label="Move down" disabled={i === ctx.project.links.length - 1} onClick={() => run(ctx, moveLink(l.id, 1))}><Icon name="down" /></button>
            <button type="button" class="icon-btn" aria-label={`Remove ${l.title}`} onClick={() => run(ctx, deleteLink(l.id))}><Icon name="close" /></button>
          </li>
        ))}
      </ul>
      <Field label="Name">
        <input value={title} maxLength={80} placeholder="Ana’s garden" onInput={(e) => setTitle(e.currentTarget.value)} />
      </Field>
      <Field label="Address">
        <input value={url} inputMode="url" autocapitalize="off" placeholder="ana.neocities.org" onInput={(e) => setUrl(e.currentTarget.value)} />
      </Field>
      <button type="button" class="btn" onClick={add}>Add friend</button>
    </div>
  )
}

function Webring(props: { ctx: Ctx; webring: Project['webring'] }) {
  const { ctx } = props
  const [ring, setRing] = useState({
    prev: props.webring.prev ?? '',
    next: props.webring.next ?? '',
    random: props.webring.random ?? '',
    hub: props.webring.hub ?? '',
  })
  const fields = [
    ['prev', 'Previous site'],
    ['next', 'Next site'],
    ['random', 'Random site'],
    ['hub', 'Webring home'],
  ] as const

  const save = () => {
    const out: Project['webring'] = {}
    for (const [key, label] of fields) {
      if (!ring[key].trim()) continue
      const href = normalizeUserUrl(ring[key])
      if (!href) return ctx.toast(`${label}: that does not look like a web address.`, 'error')
      out[key] = href
    }
    run(ctx, setWebring(out), 'Webring saved.')
  }

  return (
    <div class="card">
      <p class="muted small">If you belong to a webring, paste its links. They appear at the bottom of every page.</p>
      {fields.map(([key, label]) => (
        <Field label={label} key={key}>
          <input
            value={ring[key]}
            inputMode="url"
            autocapitalize="off"
            onInput={(e) => setRing({ ...ring, [key]: e.currentTarget.value })}
          />
        </Field>
      ))}
      <button type="button" class="btn" onClick={save}>Save webring</button>
    </div>
  )
}
