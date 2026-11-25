import { useMemo, useState } from 'preact/hooks'
import {
  allTags,
  countByKind,
  EMPTY_FILTER,
  filterPosts,
  groupByMonth,
  POST_KINDS,
  postsToMarkdown,
  type ArchiveFilter,
  type PostKind,
} from '../../core/archive.ts'
import type { Post } from '../../core/schema.ts'
import { addTagToMany, deleteMany, setManyVisibility, toggleStar } from '../commands.ts'
import { saveBytes } from '../download.ts'
import { getLang, t, useLang } from '../i18n.ts'
import { ta } from '../i18nAtelier.ts'
import { assetUrl, formatDate, Lock, run, Sheet, type Ctx } from './common.tsx'
import { KIND_ICON } from './Decorate.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { Icon, type IconName } from './icons.tsx'
import { parseTags } from '../../core/archive.ts'

const KIND_ICONS: Record<PostKind, IconName> = {
  diary: 'pen',
  reading: 'book',
  collection: 'shelf',
  outfit: 'sofa',
  memo: 'note',
  photo: 'photo',
  travel: 'globe',
  gift: 'mail',
}

/**
 * Life Archive: every kind of record in one place. Search, type, tag, date and visibility filters, a timeline by
 * month, stars, batch changes of visibility/tags/delete, and a Markdown copy. The 3D room is optional.
 */
export function Journal(props: { ctx: Ctx; onClose: () => void; initialKind?: PostKind }) {
  useLang()
  const { ctx } = props
  const lang = getLang()
  const [editing, setEditing] = useState<Post | { kind: PostKind } | null>(null)
  const [filter, setFilter] = useState<ArchiveFilter>({ ...EMPTY_FILTER, kind: props.initialKind ?? 'all' })
  const [showFilters, setShowFilters] = useState(false)
  const [picking, setPicking] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [newOpen, setNewOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const set = (patch: Partial<ArchiveFilter>) => setFilter((f) => ({ ...f, ...patch }))

  const all = ctx.project.posts
  const posts = useMemo(() => filterPosts(all, filter, lang), [all, filter, lang])
  const months = useMemo(() => groupByMonth(posts), [posts])
  const counts = useMemo(() => countByKind(all), [all])
  const tags = useMemo(() => allTags(all), [all])
  const ids = [...sel].filter((id) => all.some((p) => p.id === id))

  if (editing) {
    const isPost = 'id' in editing
    return <EntrySheet ctx={ctx} post={isPost ? editing : undefined} newKind={isPost ? undefined : editing.kind} onClose={() => setEditing(null)} />
  }

  const toggle = (id: string) =>
    setSel((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const stopPicking = () => {
    setPicking(false)
    setSel(new Set())
  }
  const filtered = filter.q || filter.kind !== 'all' || filter.tag || filter.visibility !== 'all' || filter.from || filter.to || filter.starred

  return (
    <Sheet title={ta('arc.title')} onClose={props.onClose} wide>
      <div class="journal-bar">
        <label class="search">
          <Icon name="search" size={18} />
          <input value={filter.q} placeholder={ta('arc.search')} aria-label={ta('arc.search')} onInput={(e) => set({ q: e.currentTarget.value })} />
        </label>
        <button type="button" class="btn btn-primary" onClick={() => setNewOpen((v) => !v)} aria-expanded={newOpen}>
          <Icon name="plus" size={18} /> {t('entry.new')}
        </button>
      </div>

      {newOpen && (
        <div class="kind-pick" role="group" aria-label={ta('arc.newWhat')}>
          {POST_KINDS.map((k) => (
            <button type="button" key={k} class="kind-chip" onClick={() => (setNewOpen(false), setEditing({ kind: k }))}>
              <Icon name={KIND_ICONS[k]} size={20} />
              <span>{ta(`k.${k}`)}</span>
            </button>
          ))}
        </div>
      )}

      <div class="kind-tabs" role="tablist" aria-label={ta('arc.types')}>
        {(['all', ...POST_KINDS] as const).map((k) => (
          <button type="button" role="tab" key={k} aria-selected={filter.kind === k} class={filter.kind === k ? 'on' : ''} onClick={() => set({ kind: k })}>
            {k === 'all' ? ta('arc.all') : ta(`k.${k}`)} <span class="count">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div class="journal-tools">
        <button type="button" class="btn btn-small" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
          <Icon name="list" size={16} /> {ta('arc.filters')}
        </button>
        <button type="button" class={`btn btn-small${picking ? ' btn-primary' : ''}`} aria-pressed={picking} onClick={() => (picking ? stopPicking() : setPicking(true))}>
          <Icon name="check" size={16} /> {ta('arc.select')}
        </button>
        {filtered && (
          <button type="button" class="btn btn-small" onClick={() => setFilter({ ...EMPTY_FILTER })}>
            {ta('arc.clear')}
          </button>
        )}
        <span class="muted small">{ta('arc.shown', { n: posts.length, total: all.length })}</span>
      </div>

      {showFilters && (
        <div class="card arc-filters">
          <div class="arc-row">
            <label class="field">
              <span class="field-label">{ta('arc.visibility')}</span>
              <select value={filter.visibility} onChange={(e) => set({ visibility: e.currentTarget.value as ArchiveFilter['visibility'] })}>
                <option value="all">{ta('arc.vAll')}</option>
                <option value="private">{t('entry.private')}</option>
                <option value="public">{t('entry.public')}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">{ta('arc.from')}</span>
              <input type="date" value={filter.from} onInput={(e) => set({ from: e.currentTarget.value })} />
            </label>
            <label class="field">
              <span class="field-label">{ta('arc.to')}</span>
              <input type="date" value={filter.to} onInput={(e) => set({ to: e.currentTarget.value })} />
            </label>
          </div>
          <label class="switch-row">
            <input type="checkbox" checked={filter.starred} onChange={(e) => set({ starred: e.currentTarget.checked })} />
            <span>{ta('arc.starredOnly')}</span>
          </label>
          {tags.length > 0 && (
            <div class="tag-cloud" role="group" aria-label={ta('arc.tags')}>
              {tags.map(({ tag, count }) => (
                <button type="button" key={tag} class={`tag-chip${filter.tag === tag ? ' on' : ''}`} aria-pressed={filter.tag === tag} onClick={() => set({ tag: filter.tag === tag ? '' : tag })}>
                  #{tag} <span class="count">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {picking && (
        <div class="batch-bar" role="toolbar" aria-label={ta('arc.batch')}>
          <strong>{ta('arc.selected', { n: ids.length })}</strong>
          <button type="button" class="btn btn-small" onClick={() => setSel(new Set(posts.map((p) => p.id)))}>{ta('arc.selectAll')}</button>
          <button type="button" class="btn btn-small" disabled={!ids.length} onClick={() => run(ctx, setManyVisibility(ids, 'private'), ta('arc.nowPrivate', { n: ids.length }))}>
            <Icon name="lock" size={14} /> {t('entry.private')}
          </button>
          <button
            type="button"
            class="btn btn-small"
            disabled={!ids.length}
            onClick={() => confirm(ta('arc.confirmPublic', { n: ids.length })) && run(ctx, setManyVisibility(ids, 'public'), ta('arc.nowPublic', { n: ids.length }))}
          >
            <Icon name="open" size={14} /> {t('entry.public')}
          </button>
          <span class="tag-add">
            <input value={tagInput} placeholder="#tag" aria-label={ta('arc.addTag')} onInput={(e) => setTagInput(e.currentTarget.value)} />
            <button
              type="button"
              class="btn btn-small"
              disabled={!ids.length || !parseTags(tagInput).length}
              onClick={() => {
                const [tag] = parseTags(tagInput)
                if (tag && run(ctx, addTagToMany(ids, tag), ta('arc.tagged', { tag }))) setTagInput('')
              }}
            >
              {ta('arc.addTag')}
            </button>
          </span>
          <button
            type="button"
            class="btn btn-small"
            disabled={!ids.length}
            onClick={() => saveBytes(new TextEncoder().encode(postsToMarkdown(all.filter((p) => sel.has(p.id)), lang)), 'little-internet-archive.md', 'text/markdown')}
          >
            <Icon name="download" size={14} /> {ta('arc.exportMd')}
          </button>
          <button
            type="button"
            class="btn btn-small btn-danger"
            disabled={!ids.length}
            onClick={() => {
              if (!confirm(ta('arc.confirmDelete', { n: ids.length }))) return
              if (run(ctx, deleteMany(ids), ta('arc.deleted', { n: ids.length }))) stopPicking()
            }}
          >
            <Icon name="trash" size={14} /> {t('common.delete')}
          </button>
        </div>
      )}

      {all.length === 0 && (
        <div class="empty">
          <p>{t('journal.empty')}</p>
          <p class="muted">{ta('arc.emptyHint')}</p>
        </div>
      )}
      {all.length > 0 && posts.length === 0 && <p class="muted">{t('journal.none')}</p>}

      {months.map((m) => (
        <section key={m.month} class="arc-month" aria-label={m.month}>
          <h3 class="arc-month-title">{monthTitle(m.month, lang)}</h3>
          <ul class="entry-list">
            {m.posts.map((post) => {
              const cover = ctx.project.assets.find((a) => a.id === post.imageIds[0])
              const keep = ctx.project.room.memory.find((x) => x.postId === post.id)
              const checked = sel.has(post.id)
              return (
                <li key={post.id} class={`entry${checked ? ' is-selected' : ''}`}>
                  {picking && (
                    <label class="entry-check">
                      <input type="checkbox" checked={checked} onChange={() => toggle(post.id)} aria-label={post.title || formatDate(post.createdAt)} />
                    </label>
                  )}
                  <button type="button" class="entry-main" onClick={() => (picking ? toggle(post.id) : setEditing(post))}>
                    {cover ? (
                      <img src={assetUrl(cover)} alt="" class="entry-cover" />
                    ) : (
                      <span class="entry-cover entry-cover-empty">
                        {keep ? <Icon name={KIND_ICON[keep.kind]!} size={26} /> : <Icon name={KIND_ICONS[post.kind]} size={26} />}
                      </span>
                    )}
                    <span class="entry-text">
                      <strong>{post.title || formatDate(post.createdAt)}</strong>
                      <span class="muted entry-excerpt">{excerptOf(post)}</span>
                      <span class="entry-meta">
                        <span class="kind-badge">{ta(`k.${post.kind}`)}</span>
                        <span class="muted small">{formatDate(post.createdAt)}</span>
                        {post.tags.slice(0, 3).map((tg) => (
                          <span key={tg} class="muted small">#{tg}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                  <button type="button" class={`icon-btn star${post.starred ? ' on' : ''}`} aria-pressed={post.starred} aria-label={ta('arc.star')} onClick={() => run(ctx, toggleStar(post.id))}>
                    <Icon name="star" size={22} />
                  </button>
                  <button
                    type="button"
                    class="entry-door"
                    aria-label={post.visibility === 'private' ? t('journal.openVisitors') : t('journal.makePrivate')}
                    onClick={() => run(ctx, setManyVisibility([post.id], post.visibility === 'private' ? 'public' : 'private'), post.visibility === 'private' ? t('journal.nowPublic') : t('journal.nowPrivate'))}
                  >
                    <Lock private={post.visibility === 'private'} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  )
}

function excerptOf(p: Post): string {
  const quote = p.fields.quote
  const first = quote?.trim() || p.body.trim()
  const book = p.fields.book ? `${p.fields.book}${p.fields.author ? ` · ${p.fields.author}` : ''} — ` : ''
  return `${book}${first}`.replace(/\s+/g, ' ').slice(0, 110)
}

function monthTitle(month: string, lang: 'en' | 'zh'): string {
  const d = new Date(`${month}-01T12:00:00Z`)
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' })
}
