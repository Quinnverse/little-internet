import { useState } from 'preact/hooks'
import { publicProjection } from '../../core/privacy.ts'
import { getSiteUrl, knownUsername, publishSite, setApiBase, unpublishSite } from '../publishClient.ts'
import { Field, type Ctx } from './common.tsx'

/**
 * Publish panel. Shows exactly what will be public, requires an explicit
 * username, and keeps the credential in this browser only. No accounts.
 */
export function PublishPanel(props: { ctx: Ctx }) {
  const { ctx } = props
  const pub = publicProjection(ctx.project)
  const saved = knownUsername()
  const [username, setUsername] = useState(saved ?? ctx.project.site.slug)
  const [api, setApiState] = useState(() => {
    try { return localStorage.getItem('little-internet:publish-api') || '' } catch { return '' }
  })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; status: string } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [publishedName, setPublishedName] = useState<string | null>(saved)

  const alreadyPublished = publishedName === username.trim().toLowerCase()

  const doPublish = async () => {
    setBusy(true)
    setResult(null)
    const r = await publishSite(username, ctx.project)
    setBusy(false)
    if (!r.ok) return ctx.toast(r.reason, 'error')
    setResult({ url: r.url, status: r.status })
    setPublishedName(username.trim().toLowerCase())
    ctx.toast(r.status === 'created' ? 'Your corner is online.' : 'Published site updated.', 'ok')
  }

  const doUnpublish = async () => {
    if (!confirm(`Unpublish @${username}? The address will stop serving your site immediately. People who downloaded or cached it may still have a copy.`)) return
    setBusy(true)
    const r = await unpublishSite(username.trim().toLowerCase())
    setBusy(false)
    if (!r.ok) return ctx.toast(r.reason, 'error')
    setResult(null)
    setPublishedName(null)
    ctx.toast('Site unpublished.', 'ok')
  }

  const saveApi = () => {
    setApiBase(api.trim())
    ctx.toast('Publish service address saved in this browser.', 'ok')
  }

  return (
    <div class="card">
      <p class="muted small">
        Publish a public copy at <strong>{getSiteUrl(username.trim().toLowerCase())}</strong>. Only the {pub.posts.length} public{' '}
        {pub.posts.length === 1 ? 'entry' : 'entries'} and {pub.assets.length} public {pub.assets.length === 1 ? 'photo' : 'photos'} are uploaded.
        Private entries, photos and recordings stay on this device.
      </p>
      <Field label="Your address" hint="2–31 lowercase letters, numbers or hyphens. Cannot be changed without choosing a new address.">
        <input
          value={username}
          maxLength={31}
          autocapitalize="off"
          autocomplete="off"
          aria-label="Publish username"
          onInput={(e) => { setUsername(e.currentTarget.value); setResult(null) }}
        />
      </Field>
      <button type="button" class="btn btn-primary btn-block" disabled={busy} onClick={doPublish}>
        {busy ? 'Publishing…' : alreadyPublished ? 'Update published site' : 'Publish my corner'}
      </button>

      {result && (
        <div class="publish-result" role="status">
          <p><strong>It’s live:</strong> <a href={result.url} target="_blank" rel="noopener noreferrer">{result.url}</a></p>
          <p class="muted small">Share this link. Changes you publish here replace the live copy.</p>
        </div>
      )}

      {alreadyPublished && (
        <button type="button" class="btn btn-block" disabled={busy} onClick={doUnpublish}>Unpublish</button>
      )}

      <details class="publish-advanced" open={showAdvanced}>
        <summary onClick={() => setShowAdvanced(!showAdvanced)}>Advanced: publish service address</summary>
        <Field label="API base URL" hint="Defaults to the official service. Change only for a self-hosted deployment.">
          <input value={api} placeholder="https://little.quinnverse.tech" autocapitalize="off" onInput={(e) => setApiState(e.currentTarget.value)} />
        </Field>
        <button type="button" class="btn" onClick={saveApi}>Save address</button>
      </details>

      <p class="muted small">
        Unpublishing removes the site from this platform immediately. Already-downloaded files and third-party caches
        (search engines, archives, RSS readers) cannot be recalled automatically. The publish credential is kept only
        in this browser; clear browser data and you lose the ability to update or unpublish.
      </p>
    </div>
  )
}
