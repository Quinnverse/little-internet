import { useState } from 'preact/hooks'
import type { Post } from '../../core/schema.ts'
import { setVisibility } from '../commands.ts'
import { assetUrl, formatDate, Lock, run, type Ctx } from './common.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { Icon } from './icons.tsx'

export function Diary(props: { ctx: Ctx }) {
  const { ctx } = props
  const [editing, setEditing] = useState<Post | 'new' | null>(null)
  const posts = [...ctx.project.posts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  return (
    <section class="screen">
      <div class="screen-head">
        <h1>Diary</h1>
        <button type="button" class="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} /> New entry
        </button>
      </div>

      {posts.length === 0 && (
        <div class="empty">
          <p>Your diary is empty.</p>
          <p class="muted">Entries are private until you open the door for them.</p>
        </div>
      )}

      <ul class="entry-list">
        {posts.map((post) => {
          const cover = ctx.project.assets.find((a) => a.id === post.imageIds[0])
          const priv = post.visibility === 'private'
          return (
            <li key={post.id} class="entry">
              <button type="button" class="entry-main" onClick={() => setEditing(post)}>
                {cover && <img src={assetUrl(cover)} alt="" class="entry-cover" />}
                <span class="entry-text">
                  <strong>{post.title || formatDate(post.createdAt)}</strong>
                  <span class="muted entry-excerpt">{post.body.slice(0, 120)}</span>
                  <span class="muted entry-date">{formatDate(post.createdAt)}</span>
                </span>
              </button>
              <button
                type="button"
                class="entry-door"
                aria-label={priv ? 'Open to visitors' : 'Make private'}
                onClick={() =>
                  run(
                    ctx,
                    setVisibility(post.id, priv ? 'public' : 'private'),
                    priv ? 'Visitors can now see this entry.' : 'This entry is private again.',
                  )
                }
              >
                <Lock private={priv} />
              </button>
            </li>
          )
        })}
      </ul>

      {editing && <EntrySheet ctx={ctx} post={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}
