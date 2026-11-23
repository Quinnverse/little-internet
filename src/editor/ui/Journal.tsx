import { useMemo, useState } from 'preact/hooks'
import type { Post } from '../../core/schema.ts'
import { setVisibility } from '../commands.ts'
import { t, useLang } from '../i18n.ts'
import { assetUrl, formatDate, Lock, run, Sheet, type Ctx } from './common.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { Icon } from './icons.tsx'
import { KIND_ICON } from './Decorate.tsx'

/** The efficient view of the same entries the room shows: list, search, quick visibility. */
export function Journal(props: { ctx: Ctx; onClose: () => void }) {
  useLang()
  const { ctx } = props
  const [editing, setEditing] = useState<Post | 'new' | null>(null)
  const [q, setQ] = useState('')
  const posts = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...ctx.project.posts]
      .filter((p) => !needle || p.title.toLowerCase().includes(needle) || p.body.toLowerCase().includes(needle))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [ctx.project.posts, q])

  if (editing) return <EntrySheet ctx={ctx} post={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />

  return (
    <Sheet title={t('journal.title')} onClose={props.onClose} wide>
      <div class="journal-bar">
        <label class="search">
          <Icon name="search" size={18} />
          <input value={q} placeholder={t('journal.search')} aria-label={t('journal.search')} onInput={(e) => setQ(e.currentTarget.value)} />
        </label>
        <button type="button" class="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} /> {t('entry.new')}
        </button>
      </div>

      {ctx.project.posts.length === 0 && (
        <div class="empty">
          <p>{t('journal.empty')}</p>
          <p class="muted">{t('journal.emptyHint')}</p>
        </div>
      )}
      {ctx.project.posts.length > 0 && posts.length === 0 && <p class="muted">{t('journal.none')}</p>}

      <ul class="entry-list">
        {posts.map((post) => {
          const cover = ctx.project.assets.find((a) => a.id === post.imageIds[0])
          const priv = post.visibility === 'private'
          const keep = ctx.project.room.memory.find((m) => m.postId === post.id)
          return (
            <li key={post.id} class="entry">
              <button type="button" class="entry-main" onClick={() => setEditing(post)}>
                {cover ? (
                  <img src={assetUrl(cover)} alt="" class="entry-cover" />
                ) : (
                  <span class="entry-cover entry-cover-empty">{keep ? <Icon name={KIND_ICON[keep.kind]!} size={26} /> : <Icon name="note" size={26} />}</span>
                )}
                <span class="entry-text">
                  <strong>{post.title || formatDate(post.createdAt)}</strong>
                  <span class="muted entry-excerpt">{post.body.slice(0, 110)}</span>
                  <span class="muted entry-date">{formatDate(post.createdAt)}</span>
                </span>
              </button>
              <button
                type="button"
                class="entry-door"
                aria-label={priv ? t('journal.openVisitors') : t('journal.makePrivate')}
                onClick={() =>
                  run(ctx, setVisibility(post.id, priv ? 'public' : 'private'), priv ? t('journal.nowPublic') : t('journal.nowPrivate'))
                }
              >
                <Lock private={priv} />
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
