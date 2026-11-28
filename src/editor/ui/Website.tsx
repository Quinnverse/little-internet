import { useEffect, useState } from 'preact/hooks'
import { backupFileName, createBackup } from '../../core/backup.ts'
import { publicProjection } from '../../core/privacy.ts'
import type { Project } from '../../core/schema.ts'
import { addLink, deleteLink, moveLink, normalizeUserUrl, publishDraft, setWebring } from '../commands.ts'
import { saveBytes } from '../download.ts'
import { t, useLang } from '../i18n.ts'
import { randomId } from '../ids.ts'
import { hasKey, listMessages, moderate, publishSite, savedServer, type GuestMessage } from '../publish.ts'
import { Field, formatDate, run, Sheet, type Ctx } from './common.tsx'
import { describeProject, pickProjectFile } from './files.ts'
import { Icon } from './icons.tsx'

/** The computer in the room: the owner's website, publishing, export, friends. */
export function Website(props: { ctx: Ctx; onClose: () => void; onPreview: () => void }) {
  useLang()
  const { ctx } = props
  const p = ctx.project
  const pub = publicProjection(p)
  const privEntries = p.posts.length - pub.posts.length
  const privPhotos = p.assets.length - pub.assets.length

  const downloadSite = async () => {
    const {exportSite, siteExportFileName}=await import('../../core/exportZip.ts')
    saveBytes(exportSite(p), siteExportFileName(p))
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
    const msg =
      t('web.replaceConfirm', { cur: describeProject(p), next: describeProject(r.value) }) +
      (kind === 'site' ? `\n\n${t('web.replaceWarn')}` : '')
    if (!confirm(msg)) return
    const done = ctx.replace(r.value)
    ctx.toast(done.ok ? t('web.replaced') : done.reason, done.ok ? 'ok' : 'error')
  }

  return (
    <Sheet title={t('web.title')} onClose={props.onClose} wide>
      <div class="card door-summary">
        <p>
          <Icon name="open" size={16} /> {t('web.visible', { e: pub.posts.length, p: pub.assets.length })}
        </p>
        <p>
          <Icon name="lock" size={16} /> {t('web.hidden', { e: privEntries, p: privPhotos })}
        </p>
      </div>

      <div class="card">
        <button type="button" class="btn btn-primary btn-block" onClick={props.onPreview}>
          <Icon name="eye" size={18} /> {t('web.preview')}
        </button>
        <p class="muted small">{t('web.previewHint')}</p>
      </div>

      <Publish ctx={ctx} />

      <h3>{t('web.take')}</h3>
      <div class="card">
        <button type="button" class="btn btn-block" onClick={downloadSite}>
          <Icon name="download" size={18} /> {t('web.download')}
        </button>
        <p class="muted small">{t('web.downloadHint')}</p>
      </div>
      <div class="card card-warn">
        <button type="button" class="btn btn-block" onClick={downloadBackup}>
          <Icon name="lock" size={18} /> {t('web.backup')}
        </button>
        <p class="muted small">{t('web.backupHint')}</p>
      </div>
      <div class="choice-row">
        <button type="button" class="btn" onClick={() => load('backup')}>{t('web.restore')}</button>
        <button type="button" class="btn" onClick={() => load('site')}>{t('web.importZip')}</button>
      </div>

      <h3>{t('web.friends')}</h3>
      <Links ctx={ctx} />

      <h3>{t('web.webring')}</h3>
      <Webring ctx={ctx} webring={p.webring} />
    </Sheet>
  )
}

function Publish(props: { ctx: Ctx }) {
  const { ctx } = props
  const slug = ctx.project.site.slug
  const [server, setServer] = useState(savedServer())
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<GuestMessage[] | null>(null)
  const [known, setKnown] = useState(false)

  const refresh = async () => {
    try {
      setMessages(await listMessages(slug, server))
      setError(null)
    } catch (e) {
      setMessages(null)
      setError(t('pub.fail', { why: (e as Error).message }))
    }
  }

  useEffect(() => {
    hasKey(slug).then((k) => {
      setKnown(k)
      if (k) void refresh()
    })
  }, [slug])

  // New notes arrive while the sheet is open or the tab is in the background.
  useEffect(() => {
    if (!known) return
    const again = () => void refresh()
    const timer = window.setInterval(again, 20000)
    window.addEventListener('focus', again)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', again)
    }
  }, [known, slug, server])

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      // Publishing from here also publishes the current website draft.
      const next = publishDraft(new Date().toISOString())(ctx.project)
      const where = await publishSite(next, server)
      ctx.replace(next)
      setUrl(where)
      setKnown(true)
      ctx.toast(t('pub.done', { url: where }))
      await refresh()
    } catch (e) {
      setError(t('pub.fail', { why: (e as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  const act = async (m: GuestMessage, action: 'approve' | 'delete') => {
    try {
      await moderate(slug, server, m.id, action)
      await refresh()
    } catch (e) {
      setError(t('pub.fail', { why: (e as Error).message }))
    }
  }

  return (
    <>
      <h3>{t('pub.title')}</h3>
      <div class="card">
        <p class="muted small">{t('pub.hint', { url: `${location.origin}/@${slug}/` })}</p>
        <Field label={t('pub.server')} hint={t('pub.serverHint')}>
          <input value={server} inputMode="url" autocapitalize="off" placeholder={location.origin} onInput={(e) => setServer(e.currentTarget.value)} />
        </Field>
        <button type="button" class="btn btn-primary btn-block" disabled={busy} onClick={publish}>
          <Icon name="cloud" size={18} /> {busy ? t('pub.working') : t('pub.button')}
        </button>
        {url && (
          <p>
            <a href={url} target="_blank" rel="noopener">{t('pub.open')}: {url}</a>
          </p>
        )}
        {error && <p class="error" role="alert">{error}</p>}
      </div>

      <h3>{t('pub.inbox')}</h3>
      <div class="card">
        <p class="muted small">{t('pub.inboxHint')}</p>
        {!known && <p class="muted">{t('pub.needPublish')}</p>}
        {known && messages && (
          <>
            {messages.length === 0 && <p class="muted">{t('pub.inboxEmpty')}</p>}
            <ul class="msg-list">
              {messages.map((m) => (
                <li key={m.id} class="msg">
                  <strong>{m.name}</strong>
                  <span class="muted small"> · {formatDate(m.createdAt)}</span>
                  <p>{m.text}</p>
                  <div class="choice-row">
                    {m.approved ? (
                      <span class="badge badge-public">{t('pub.approved')}</span>
                    ) : (
                      <button type="button" class="btn btn-small btn-primary" onClick={() => act(m, 'approve')}>{t('pub.approve')}</button>
                    )}
                    <button type="button" class="btn btn-small btn-danger" onClick={() => act(m, 'delete')}>{t('pub.reject')}</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {known && (
          <button type="button" class="btn btn-small" onClick={refresh}>{t('pub.refresh')}</button>
        )}
      </div>
    </>
  )
}

function Links(props: { ctx: Ctx }) {
  const { ctx } = props
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')

  const add = () => {
    const href = normalizeUserUrl(url)
    if (!href) return ctx.toast(t('web.addrBad'), 'error')
    const label = title.trim() || new URL(href).hostname
    if (run(ctx, addLink({ id: randomId(), title: label.slice(0, 80), url: href }))) {
      setTitle('')
      setUrl('')
    }
  }

  return (
    <div class="card">
      {ctx.project.links.length === 0 && <p class="muted">{t('web.noFriends')}</p>}
      <ul class="link-list">
        {ctx.project.links.map((l, i) => (
          <li key={l.id}>
            <span class="link-text">
              <strong>{l.title}</strong>
              <span class="muted small">{l.url}</span>
            </span>
            <button type="button" class="icon-btn" aria-label={t('web.moveUp')} disabled={i === 0} onClick={() => run(ctx, moveLink(l.id, -1))}><Icon name="up" /></button>
            <button type="button" class="icon-btn" aria-label={t('web.moveDown')} disabled={i === ctx.project.links.length - 1} onClick={() => run(ctx, moveLink(l.id, 1))}><Icon name="down" /></button>
            <button type="button" class="icon-btn" aria-label={t('web.remove', { name: l.title })} onClick={() => run(ctx, deleteLink(l.id))}><Icon name="close" /></button>
          </li>
        ))}
      </ul>
      <Field label={t('web.friendName')}>
        <input value={title} maxLength={80} placeholder={t('web.friendNamePh')} onInput={(e) => setTitle(e.currentTarget.value)} />
      </Field>
      <Field label={t('web.friendAddr')}>
        <input value={url} inputMode="url" autocapitalize="off" placeholder="ana.neocities.org" onInput={(e) => setUrl(e.currentTarget.value)} />
      </Field>
      <button type="button" class="btn" onClick={add}>{t('web.friendAdd')}</button>
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
    ['prev', t('web.ringPrev')],
    ['next', t('web.ringNext')],
    ['random', t('web.ringRandom')],
    ['hub', t('web.ringHub')],
  ] as const

  const save = () => {
    const out: Project['webring'] = {}
    for (const [key, label] of fields) {
      if (!ring[key].trim()) continue
      const href = normalizeUserUrl(ring[key])
      if (!href) return ctx.toast(t('web.ringBad', { label }), 'error')
      out[key] = href
    }
    run(ctx, setWebring(out), t('web.ringSaved'))
  }

  return (
    <div class="card">
      <p class="muted small">{t('web.webringHint')}</p>
      {fields.map(([key, label]) => (
        <Field label={label} key={key}>
          <input value={ring[key]} inputMode="url" autocapitalize="off" onInput={(e) => setRing({ ...ring, [key]: e.currentTarget.value })} />
        </Field>
      ))}
      <button type="button" class="btn" onClick={save}>{t('web.ringSave')}</button>
    </div>
  )
}
