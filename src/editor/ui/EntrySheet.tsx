import { useState } from 'preact/hooks'
import { archiveLabel, KIND_FIELDS, parseTags, type FieldDef, type PostKind } from '../../core/archive.ts'
import type { Asset, Post } from '../../core/schema.ts'
import { parseVideoUrl } from '../../core/video.ts'
import { MEMORY_KINDS, type MemoryKind } from '../../core/room.ts'
import { addAsset, addPost, compose, deletePost, setPostObject, setVisibility, updatePost, type Command } from '../commands.ts'
import { pickFiles } from '../download.ts'
import { getLang, t, useLang, type Key } from '../i18n.ts'
import { ta } from '../i18nAtelier.ts'
import { randomId } from '../ids.ts'
import { processPhoto } from '../images.ts'
import { assetUrl, Field, run, Sheet, type Ctx } from './common.tsx'
import { KIND_ICON } from './Decorate.tsx'
import { Icon } from './icons.tsx'

const MAX_PHOTOS = 12

function videoText(post?: Post): string {
  if (!post?.video) return ''
  return post.video.provider === 'youtube'
    ? `https://youtu.be/${post.video.videoId}`
    : `https://vimeo.com/${post.video.videoId}`
}

export function EntrySheet(props: { ctx: Ctx; post?: Post; newKind?: PostKind; onClose: () => void }) {
  useLang()
  const { ctx, post } = props
  const existingObject = post ? ctx.project.room.memory.find((m) => m.postId === post.id) : undefined
  const [keepsake, setKeepsake] = useState<MemoryKind | null>(existingObject?.kind ?? null)
  const kind: PostKind = post?.kind ?? props.newKind ?? 'diary'
  const lang = getLang()
  const [fields, setFields] = useState<Post['fields']>(post?.fields ?? {})
  const [tagText, setTagText] = useState((post?.tags ?? []).map((x) => `#${x}`).join(' '))
  const [starred, setStarred] = useState(post?.starred ?? false)
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
      if (files.length > room) setError(t('entry.tooMany', { n: MAX_PHOTOS }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    const trimmedVideo = video.trim()
    const embed = trimmedVideo ? parseVideoUrl(trimmedVideo) : null
    if (trimmedVideo && !embed) return setError(t('entry.videoBad'))
    const filledAny = Object.values(fields).some((v) => (v ?? '').trim() !== '')
    if (!title.trim() && !body.trim() && photos.length === 0 && !filledAny) return setError(t('entry.empty'))
    const cleanFields: Post['fields'] = {}
    for (const d of KIND_FIELDS[kind]) {
      const v = fields[d.key]
      if (v !== undefined && v.trim() !== '') cleanFields[d.key] = v.trim()
    }
    const tags = parseTags(tagText)

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
          kind,
          tags,
          fields: cleanFields,
          starred,
          ...(embed ? { video: embed } : {}),
        }),
      )
    } else {
      cmds.push(updatePost(post.id, { title: title.trim(), body, imageIds, video: embed, tags, fields: cleanFields, starred }))
    }
    const wantPublic = isPublic ? 'public' : 'private'
    if ((post?.visibility ?? 'private') !== wantPublic) cmds.push(setVisibility(id!, wantPublic))

    // The owner's choice of keepsake. Nothing is ever generated from the text.
    if (keepsake !== (existingObject?.kind ?? null)) cmds.push(setPostObject(id!, keepsake, randomId()))

    const r = ctx.apply(compose(...cmds))
    if (!r.ok) return setError(r.reason)
    ctx.toast(isPublic ? t('entry.savedPublic') : t('entry.savedPrivate'))
    props.onClose()
  }

  const remove = () => {
    if (!post || !confirm(t('entry.confirmDelete'))) return
    if (run(ctx, deletePost(post.id), t('entry.deleted'))) props.onClose()
  }

  return (
    <Sheet title={`${post ? t('entry.edit') : t('entry.new')} · ${archiveLabel(`kind.${kind}`, lang)}`} onClose={props.onClose}>
      <Field label={t('entry.title')}>
        <input value={title} maxLength={120} placeholder={t('entry.titlePh')} onInput={(e) => setTitle(e.currentTarget.value)} />
      </Field>
      {KIND_FIELDS[kind].length > 0 && (
        <div class="kind-fields">
          {KIND_FIELDS[kind].map((d) => (
            <KindField key={d.key} def={d} value={fields[d.key] ?? ''} onChange={(v) => setFields((f) => ({ ...f, [d.key]: v }))} />
          ))}
        </div>
      )}
      <Field label={t('entry.body')}>
        <textarea
          value={body}
          rows={8}
          maxLength={20000}
          placeholder={t('entry.bodyPh')}
          onInput={(e) => setBody(e.currentTarget.value)}
        />
      </Field>

      <Field label={ta('arc.tags')} hint={ta('arc.tagsHint')}>
        <input value={tagText} placeholder="#cozy #winter" onInput={(e) => setTagText(e.currentTarget.value)} />
      </Field>
      <label class="switch-row">
        <input type="checkbox" checked={starred} onChange={(e) => setStarred(e.currentTarget.checked)} />
        <span>{ta('arc.star')}</span>
      </label>

      <div class="field">
        <span class="field-label">{t('entry.photos')}</span>
        <div class="photo-row">
          {photos.map((a) => (
            <div class="photo-thumb" key={a.id}>
              <img src={assetUrl(a)} alt="" />
              <button
                type="button"
                class="icon-btn thumb-remove"
                aria-label={t('entry.removePhoto')}
                onClick={() => setPhotos((cur) => cur.filter((x) => x.id !== a.id))}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" class="photo-add" disabled={busy} onClick={addPhotos} aria-label={t('entry.addPhotos')}>
              {busy ? '…' : <Icon name="plus" size={26} />}
            </button>
          )}
        </div>
      </div>

      <Field label={t('entry.video')} hint={t('entry.videoHint')}>
        <input value={video} inputMode="url" placeholder="https://youtu.be/…" onInput={(e) => setVideo(e.currentTarget.value)} />
      </Field>

      <div class="field">
        <span class="field-label">{t('entry.keepsake')}</span>
        <div class="keep-row" role="group" aria-label={t('entry.keepsake')}>
          <button type="button" class={`keep-btn ${keepsake === null ? 'selected' : ''}`} aria-pressed={keepsake === null} onClick={() => setKeepsake(null)}>
            <Icon name="none" size={20} />
            <span>{t('entry.keepNone')}</span>
          </button>
          {MEMORY_KINDS.map((k) => (
            <button type="button" key={k} class={`keep-btn ${keepsake === k ? 'selected' : ''}`} aria-pressed={keepsake === k} onClick={() => setKeepsake(k)}>
              <Icon name={KIND_ICON[k]!} size={20} />
              <span>{t(`kind.${k}` as Key)}</span>
            </button>
          ))}
        </div>
        <span class="field-hint">{t('entry.keepsakeHint')}</span>
      </div>

      <div class="door-toggle" role="group" aria-label={t('entry.who')}>
        <button type="button" class={!isPublic ? 'selected' : ''} aria-pressed={!isPublic} onClick={() => setIsPublic(false)}>
          <Icon name="lock" size={18} /> {t('entry.private')}
        </button>
        <button type="button" class={isPublic ? 'selected' : ''} aria-pressed={isPublic} onClick={() => setIsPublic(true)}>
          <Icon name="open" size={18} /> {t('entry.public')}
        </button>
      </div>

      {error && <p class="error" role="alert">{error}</p>}

      <div class="sheet-actions">
        {post && (
          <button type="button" class="btn btn-danger" onClick={remove}>
            {t('common.delete')}
          </button>
        )}
        <button type="button" class="btn btn-primary" disabled={busy} onClick={save}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  )
}

function KindField(props: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const { def, value } = props
  const lang = getLang()
  const label = archiveLabel(`f.${def.key}`, lang)
  if (def.type === 'text')
    return (
      <Field label={label}>
        <textarea rows={3} value={value} maxLength={1000} onInput={(e) => props.onChange(e.currentTarget.value)} />
      </Field>
    )
  if (def.type === 'date')
    return (
      <Field label={label}>
        <input type="date" value={value} onInput={(e) => props.onChange(e.currentTarget.value)} />
      </Field>
    )
  if (def.type === 'rating')
    return (
      <div class="field">
        <span class="field-label">{label}</span>
        <div class="stars" role="group" aria-label={label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} class={Number(value) >= n ? 'on' : ''} aria-pressed={Number(value) >= n} aria-label={`${n} / 5`} onClick={() => props.onChange(String(Number(value) === n ? 0 : n))}>
              <Icon name="star" size={26} />
            </button>
          ))}
        </div>
      </div>
    )
  if (def.type === 'choice')
    return (
      <div class="field">
        <span class="field-label">{label}</span>
        <div class="seg" role="group" aria-label={label}>
          {def.choices!.map((c) => (
            <button type="button" key={c} class={value === c ? 'on' : ''} aria-pressed={value === c} onClick={() => props.onChange(value === c ? '' : c)}>
              {archiveLabel(`c.${c}`, lang)}
            </button>
          ))}
        </div>
      </div>
    )
  if (def.type === 'yesno')
    return (
      <label class="switch-row">
        <input type="checkbox" checked={value === 'yes'} onChange={(e) => props.onChange(e.currentTarget.checked ? 'yes' : 'no')} />
        <span>{label}</span>
      </label>
    )
  return (
    <Field label={label}>
      <input value={value} maxLength={200} onInput={(e) => props.onChange(e.currentTarget.value)} />
    </Field>
  )
}
