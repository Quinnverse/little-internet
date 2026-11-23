import { useState } from 'preact/hooks'
import type { Asset, Post } from '../../core/schema.ts'
import { parseVideoUrl } from '../../core/video.ts'
import { addAsset, addPost, compose, deletePost, setVisibility, updatePost, type Command } from '../commands.ts'
import { pickFiles } from '../download.ts'
import { randomId } from '../ids.ts'
import { processPhoto } from '../images.ts'
import { assetUrl, Field, run, Sheet, type Ctx } from './common.tsx'

const MAX_PHOTOS = 12

function videoText(post?: Post): string {
  if (!post?.video) return ''
  return post.video.provider === 'youtube'
    ? `https://youtu.be/${post.video.videoId}`
    : `https://vimeo.com/${post.video.videoId}`
}

export function EntrySheet(props: { ctx: Ctx; post?: Post; onClose: () => void }) {
  const { ctx, post } = props
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [photos, setPhotos] = useState<Asset[]>(() =>
    (post?.imageIds ?? []).map((id) => ctx.project.assets.find((a) => a.id === id)).filter((a): a is Asset => !!a),
  )
  const [video, setVideo] = useState(videoText(post))
  const [isPublic, setIsPublic] = useState(post?.visibility === 'public')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addPhotos = async () => {
    const files = await pickFiles('image/*', true)
    if (!files.length) return
    setBusy(true)
    setError(null)
    try {
      const room = MAX_PHOTOS - photos.length
      const added: Asset[] = []
      for (const f of files.slice(0, room)) {
        const img = await processPhoto(f)
        added.push({ id: randomId(), ...img })
      }
      setPhotos((cur) => [...cur, ...added])
      if (files.length > room) setError(`An entry can hold ${MAX_PHOTOS} photos; the rest were skipped.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    const trimmedVideo = video.trim()
    const embed = trimmedVideo ? parseVideoUrl(trimmedVideo) : null
    if (trimmedVideo && !embed) return setError('Only YouTube and Vimeo links can be embedded.')
    if (!title.trim() && !body.trim() && photos.length === 0) return setError('Write something or add a photo first.')

    const existing = new Set(ctx.project.assets.map((a) => a.id))
    const cmds: Command[] = photos.filter((a) => !existing.has(a.id)).map(addAsset)
    const imageIds = photos.map((a) => a.id)
    let id = post?.id
    if (!post) {
      id = randomId()
      cmds.push(
        addPost({
          id,
          createdAt: new Date().toISOString(),
          title: title.trim(),
          body,
          imageIds,
          ...(embed ? { video: embed } : {}),
        }),
      )
    } else {
      cmds.push(updatePost(post.id, { title: title.trim(), body, imageIds, video: embed }))
    }
    const wantPublic = isPublic ? 'public' : 'private'
    if ((post?.visibility ?? 'private') !== wantPublic) cmds.push(setVisibility(id!, wantPublic))

    const r = ctx.apply(compose(...cmds))
    if (!r.ok) return setError(r.reason)
    ctx.toast(isPublic ? 'Saved. Visitors can see this entry.' : 'Saved. Only you can see this entry.')
    props.onClose()
  }

  const remove = () => {
    if (!post || !confirm('Delete this entry? This cannot be undone.')) return
    if (run(ctx, deletePost(post.id), 'Entry deleted.')) props.onClose()
  }

  return (
    <Sheet title={post ? 'Edit entry' : 'New entry'} onClose={props.onClose}>
      <Field label="Title">
        <input value={title} maxLength={120} placeholder="Today" onInput={(e) => setTitle(e.currentTarget.value)} />
      </Field>
      <Field label="Entry">
        <textarea
          value={body}
          rows={8}
          maxLength={20000}
          placeholder="Nobody is watching. Write whatever you like."
          onInput={(e) => setBody(e.currentTarget.value)}
        />
      </Field>

      <div class="field">
        <span class="field-label">Photos</span>
        <div class="photo-row">
          {photos.map((a) => (
            <div class="photo-thumb" key={a.id}>
              <img src={assetUrl(a)} alt="" />
              <button
                type="button"
                class="icon-btn thumb-remove"
                aria-label="Remove photo"
                onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== a.id))}
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" class="photo-add" disabled={busy} onClick={addPhotos} aria-label="Add photos">
              {busy ? '…' : '+'}
            </button>
          )}
        </div>
      </div>

      <Field label="Video link (optional)" hint="YouTube or Vimeo. Embedded videos stay hosted by them.">
        <input value={video} inputMode="url" placeholder="https://youtu.be/…" onInput={(e) => setVideo(e.currentTarget.value)} />
      </Field>

      <div class="door-toggle" role="group" aria-label="Who can see this">
        <button type="button" class={!isPublic ? 'selected' : ''} aria-pressed={!isPublic} onClick={() => setIsPublic(false)}>
          🔒 Just for me
        </button>
        <button type="button" class={isPublic ? 'selected' : ''} aria-pressed={isPublic} onClick={() => setIsPublic(true)}>
          🚪 Open to visitors
        </button>
      </div>

      {error && <p class="error" role="alert">{error}</p>}

      <div class="sheet-actions">
        {post && (
          <button type="button" class="btn btn-danger" onClick={remove}>
            Delete
          </button>
        )}
        <button type="button" class="btn btn-primary" disabled={busy} onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  )
}
