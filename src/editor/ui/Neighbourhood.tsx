import { useEffect, useState } from 'preact/hooks'
import { backupFileName, createBackup } from '../../core/backup.ts'
import { exportSite, siteExportFileName } from '../../core/exportZip.ts'
import type { Project } from '../../core/schema.ts'
import { addAsset, addLink, compose, setGuestbookSnapshot, setWebring } from '../commands.ts'
import { saveBytes } from '../download.ts'
import { t, useLang } from '../i18n.ts'
import { ta } from '../i18nAtelier.ts'
import { randomId } from '../ids.ts'
import {
  approvedNotes,
  base,
  closeDoor,
  fetchBadge,
  joinRing,
  leaveRing,
  publishSite,
  ringHomes,
  savedServer,
  siteStatus,
  siteUrl,
  type RingHome,
  type SiteStatus,
} from '../publish.ts'
import { GhostIcon, Sheet, type Ctx } from './common.tsx'
import { describeProject, pickProjectFile } from './files.ts'
import { Icon, type IconName } from './icons.tsx'

// ---------------------------------------------------------------------------- the computer (CRT)

export type ComputerChoice = 'visit' | 'decorate' | 'walk' | 'move' | 'publish'

/** Clicking the CRT: visit or decorate the website, walk the webring, move house, publishing. */
export function ComputerSheet(props: { onChoose: (c: ComputerChoice) => void; onClose: () => void }) {
  useLang()
  const items: [ComputerChoice, IconName, string, string][] = [
    ['visit', 'eye', ta('crt.visit'), ta('crt.visitHint')],
    ['decorate', 'palette', ta('crt.decorate'), ta('crt.decorateHint')],
    ['walk', 'globe', ta('crt.walk'), ta('crt.walkHint')],
    ['move', 'suitcase', ta('crt.move'), ta('crt.moveHint')],
    ['publish', 'cloud', ta('crt.publish'), ta('crt.publishHint')],
  ]
  return (
    <Sheet title={ta('crt.title')} onClose={props.onClose}>
      <div class="crt-menu">
        {items.map(([k, icon, title, hint], i) => (
          <button type="button" key={k} class={`crt-item${i < 2 ? ' crt-main' : ''}`} onClick={() => props.onChoose(k)}>
            <Icon name={icon} size={i < 2 ? 26 : 22} />
            <span>
              <strong>{title}</strong>
              <span class="muted small">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/** Publishes the CURRENT published snapshot again (door reopening, ring links, privacy sync). */
export async function republish(ctx: Ctx, project: Project, server: string): Promise<Project> {
  let next = project
  const notes = await approvedNotes(project.site.slug, server)
  if (notes) next = setGuestbookSnapshot(notes)(next)
  await publishSite(next, server)
  if (next !== project) ctx.replace(next)
  return next
}

// ---------------------------------------------------------------------------- the door

export function DoorSheet(props: { ctx: Ctx; onClose: () => void; onPreview: () => void; onAtelier: () => void }) {
  useLang()
  const { ctx } = props
  const slug = ctx.project.site.slug
  const server = savedServer()
  const [status, setStatus] = useState<SiteStatus | null | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = siteUrl(slug, server)

  const load = () =>
    siteStatus(slug, server).then(
      (s) => setStatus(s),
      (e) => {
        setStatus(null)
        setError(ta('door.fail', { why: (e as Error).message }))
      },
    )
  useEffect(() => void load(), [slug])

  const close = async () => {
    if (!confirm(ta('door.closeConfirm'))) return
    setBusy(true)
    setError(null)
    try {
      await closeDoor(slug, server)
      ctx.toast(ta('door.isClosed'))
      await load()
    } catch (e) {
      setError(ta('door.fail', { why: (e as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  const reopen = async () => {
    if (!ctx.project.web.published) return props.onAtelier()
    setBusy(true)
    setError(null)
    try {
      await republish(ctx, ctx.project, server)
      ctx.toast(ta('door.isOpen'))
      await load()
    } catch (e) {
      setError(ta('door.fail', { why: (e as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  const open = status !== 'loading' && status?.open === true
  return (
    <Sheet title={ta('door.title')} onClose={props.onClose}>
      <div class={`door-state ${status === 'loading' ? '' : open ? 'is-open' : 'is-closed'}`}>
        <div class="door-art" aria-hidden="true">
          <span class="door-leaf" />
        </div>
        <div>
          {status === 'loading' && <p class="muted">{ta('walk.loading')}</p>}
          {status === null && <p>{ta('door.unknown')}</p>}
          {status && status !== 'loading' && (
            <>
              <p><strong>{ta('door.state', { state: open ? ta('door.open') : ta('door.closed') })}</strong></p>
              <p class="muted small">{open ? ta('door.openD') : ta('door.closedD')}</p>
            </>
          )}
        </div>
      </div>
      {error && <p class="error" role="alert">{error}</p>}

      {open && (
        <div class="card">
          <p class="field-label">{ta('door.share')}</p>
          <p class="share-url"><a href={url} target="_blank" rel="noopener">{url}</a></p>
          <button
            type="button"
            class="btn btn-small"
            onClick={() => navigator.clipboard?.writeText(url).then(() => ctx.toast(ta('door.copied')), () => undefined)}
          >
            <Icon name="copy" size={16} /> {ta('door.copy')}
          </button>
        </div>
      )}

      <div class="card">
        <button type="button" class="btn btn-block" onClick={props.onPreview}><Icon name="eye" size={18} /> {ta('door.preview')}</button>
        {open ? (
          <button type="button" class="btn btn-danger btn-block" disabled={busy} onClick={close}>
            <Icon name="lock" size={18} /> {busy ? ta('door.working') : ta('door.close')}
          </button>
        ) : (
          <>
            {ctx.project.web.published && status !== null && <p class="muted small">{ta('door.reopenNote')}</p>}
            {(!ctx.project.web.published || status === null) && <p class="muted small">{ta('door.notYet')}</p>}
            <button type="button" class="btn btn-primary btn-block" disabled={busy || status === 'loading'} onClick={status === null || !ctx.project.web.published ? props.onAtelier : reopen}>
              <Icon name="door" size={18} /> {busy ? ta('door.working') : ctx.project.web.published && status !== null ? ta('door.reopen') : ta('door.toAtelier')}
            </button>
          </>
        )}
        <p class="muted small">{ta('door.copies')}</p>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------- Internet Walk

export function WalkSheet(props: { ctx: Ctx; onClose: () => void }) {
  useLang()
  const { ctx } = props
  const p = ctx.project
  const server = savedServer()
  const [homes, setHomes] = useState<RingHome[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<SiteStatus | null>(null)

  const load = async () => {
    try {
      setHomes(await ringHomes(server))
      setStatus(await siteStatus(p.site.slug, server).catch(() => null))
    } catch (e) {
      setError(ta('walk.offline', { why: (e as Error).message }))
    }
  }
  useEffect(() => void load(), [])

  const saved = new Set(p.links.map((l) => l.url))
  const save = async (h: RingHome) => {
    const url = siteUrl(h.slug, server)
    const badge = h.button ? await fetchBadge(server, h.button) : null
    const id = randomId()
    const cmds = badge
      ? compose(addAsset({ id, mime: badge.mime, data: badge.data }), addLink({ id: randomId(), title: h.title.slice(0, 80) || h.slug, url, buttonAssetId: id }))
      : addLink({ id: randomId(), title: h.title.slice(0, 80) || h.slug, url })
    const r = ctx.apply(cmds)
    if (!r.ok) return ctx.toast(r.reason, 'error')
    ctx.toast(ta('walk.saved', { name: h.title || h.slug }))
  }

  const join = async () => {
    if (!p.web.published || !status) return ctx.toast(ta('walk.needPublish'), 'error')
    setBusy(true)
    try {
      const links = await joinRing(p.site.slug, server)
      const r = ctx.apply(setWebring(links))
      if (!r.ok) throw new Error(r.reason)
      await republish(ctx, r.value, server)
      ctx.toast(ta('walk.joined'))
      await load()
    } catch (e) {
      ctx.toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    setBusy(true)
    try {
      await leaveRing(p.site.slug, server)
      const r = ctx.apply(setWebring({}))
      if (r.ok && p.web.published) await republish(ctx, r.value, server)
      ctx.toast(ta('walk.left'))
      await load()
    } catch (e) {
      ctx.toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const randomHref = homes?.length ? `${base(server)}/ring/${homes[0]!.slug}/random` : null
  return (
    <Sheet title={ta('walk.title')} onClose={props.onClose} wide>
      <p class="muted">{ta('walk.intro')}</p>
      <div class="choice-row">
        {randomHref && <a class="btn btn-primary" href={randomHref} target="_blank" rel="noopener"><Icon name="globe" size={18} /> {ta('walk.random')}</a>}
        {status?.ring ? (
          <button type="button" class="btn" disabled={busy} onClick={leave}>{ta('walk.leave')}</button>
        ) : (
          <button type="button" class="btn" disabled={busy} onClick={join}>{ta('walk.join')}</button>
        )}
      </div>
      {error && <p class="error" role="alert">{error}</p>}
      {!homes && !error && <p class="muted">{ta('walk.loading')}</p>}
      {homes && homes.length === 0 && <p class="muted">{ta('walk.empty')}</p>}
      <ul class="walk-list">
        {homes?.map((h) => {
          const url = siteUrl(h.slug, server)
          const mine = h.slug === p.site.slug
          return (
            <li key={h.slug} class="walk-home">
              {h.button ? <img class="badge88" src={`${base(server)}${h.button}`} width={88} height={31} alt="" /> : <span class="badge88 badge-text">{h.title.slice(0, 16)}</span>}
              <span class="walk-text">
                <strong>{h.title || h.slug}</strong>
                {h.demo && <span class="demo-tag">{ta('walk.demo')}</span>}
                <span class="muted small">{h.tagline}</span>
              </span>
              <span class="walk-actions">
                <a class="btn btn-small" href={url} target="_blank" rel="noopener">{ta('walk.visit')}</a>
                {mine ? (
                  <span class="muted small">{ta('walk.you')}</span>
                ) : saved.has(url) ? (
                  <span class="muted small">{ta('walk.already')}</span>
                ) : (
                  <button type="button" class="btn btn-small" onClick={() => save(h)}><Icon name="badge" size={16} /> {ta('walk.save')}</button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p class="muted small">{ta('walk.oneWay')}</p>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------- Move My Home

export function MoveSheet(props: { ctx: Ctx; onClose: () => void }) {
  useLang()
  const { ctx } = props
  const p = ctx.project
  const [packing, setPacking] = useState(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (!packing) return
    const id = window.setTimeout(() => setPacking(false), 2400)
    return () => window.clearTimeout(id)
  }, [packing])

  const downloadSite = async () => {
    let next = p
    const notes = await approvedNotes(p.site.slug, savedServer())
    if (notes) {
      next = setGuestbookSnapshot(notes)(p)
      ctx.replace(next)
    }
    saveBytes(exportSite(next), siteExportFileName(next))
    ctx.toast(t('web.downloaded'))
  }
  const downloadBackup = () => {
    saveBytes(createBackup(p), backupFileName(p))
    ctx.toast(t('web.backedUp'))
  }
  const load = async (kind: 'site' | 'backup') => {
    const r = await pickProjectFile(kind)
    if (!r) return
    if (!r.ok) return ctx.toast(r.reason, 'error')
    const msg = t('web.replaceConfirm', { cur: describeProject(p), next: describeProject(r.value) }) + (kind === 'site' ? `\n\n${t('web.replaceWarn')}` : '')
    if (!confirm(msg)) return
    const done = ctx.replace(r.value)
    ctx.toast(done.ok ? t('web.replaced') : done.reason, done.ok ? 'ok' : 'error')
  }

  return (
    <Sheet title={ta('move.title')} onClose={props.onClose} wide>
      {packing ? (
        <div class="packing" role="status">
          <div class="packing-art" aria-hidden="true">
            <GhostIcon color={p.ghost.color} size={64} />
            <span class="suitcase"><span class="item i1" /><span class="item i2" /><span class="item i3" /></span>
          </div>
          <p class="move-tag">{ta('move.tag')}</p>
          <button type="button" class="btn btn-small" onClick={() => setPacking(false)}>{ta('move.skip')}</button>
        </div>
      ) : (
        <>
          <p class="move-tag">{ta('move.tag')}</p>
          <p class="muted">{ta('move.sub')}</p>
          <div class="move-cards">
            <div class="card move-card">
              <h3><Icon name="globe" size={20} /> {ta('move.site')}</h3>
              <p class="small">{ta('move.siteD')}</p>
              {!p.web.published && <p class="muted small">{ta('move.siteDraft')}</p>}
              <button type="button" class="btn btn-primary btn-block" onClick={downloadSite}><Icon name="download" size={18} /> {ta('move.siteBtn')}</button>
            </div>
            <div class="card move-card">
              <h3><Icon name="home" size={20} /> {ta('move.home')}</h3>
              <p class="small">{ta('move.homeD')}</p>
            </div>
            <div class="card card-warn move-card">
              <h3><Icon name="lock" size={20} /> {ta('move.all')}</h3>
              <p class="small">{ta('move.allD')}</p>
              <button type="button" class="btn btn-block" onClick={downloadBackup}><Icon name="lock" size={18} /> {ta('move.allBtn')}</button>
            </div>
          </div>
          <div class="choice-row">
            <button type="button" class="btn" onClick={() => load('backup')}>{ta('move.restore')}</button>
            <button type="button" class="btn" onClick={() => load('site')}>{ta('move.import')}</button>
          </div>
        </>
      )}
    </Sheet>
  )
}
