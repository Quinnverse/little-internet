import { useMemo, useState } from 'preact/hooks'
import type { Post } from '../../core/schema.ts'
import { askMemories, onThisDay } from '../memories.ts'
import { Field, formatDate, GhostIcon, Sheet, type Ctx } from './common.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { Icon } from './icons.tsx'

/** Owner-only ghost: memories from the owner's own entries, computed on the device. */
export function OwnerGhost(props: { ctx: Ctx; onClose: () => void }) {
  const { ctx } = props
  const { ghost, posts } = ctx.project
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Post | null>(null)
  const today = useMemo(() => onThisDay(posts, new Date()), [posts])
  const answers = useMemo(() => askMemories(posts, query), [posts, query])
  const name = ghost.name || 'Your ghost'

  if (open) return <EntrySheet ctx={ctx} post={open} onClose={() => setOpen(null)} />

  return (
    <Sheet title={name} onClose={props.onClose}>
      <div class="owner-ghost-head">
        <GhostIcon color={ghost.color} size={56} />
        <div>
          <p>
            <strong>Hi, it’s {name}.</strong> I remember what you write here.
          </p>
          <p class="muted small">
            <Icon name="lock" size={13} /> Only you see this. Nothing leaves this device.
          </p>
        </div>
      </div>

      <h3 class="owner-ghost-h">On this day</h3>
      {today.length === 0 ? (
        <p class="muted">Nothing from this day in earlier years — yet.</p>
      ) : (
        <ul class="memory-list">
          {today.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p)}>
                <span class="memory-date">{new Date(p.createdAt).getFullYear()}</span>
                <strong>{p.title || formatDate(p.createdAt)}</strong>
                <span class="memory-excerpt">{p.body.slice(0, 120)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 class="owner-ghost-h">Ask {name}</h3>
      <Field label={`When did I last write about…`}>
        <input value={query} maxLength={60} placeholder="the sea, work, 海边…" onInput={(e) => setQuery(e.currentTarget.value)} />
      </Field>
      {query.trim() !== '' && answers.length === 0 && (
        <p class="muted">I don’t remember you writing about “{query.trim()}”.</p>
      )}
      <ul class="memory-list" aria-live="polite">
        {answers.map(({ post, excerpt }) => (
          <li key={post.id}>
            <button type="button" onClick={() => setOpen(post)}>
              <span class="memory-date">From your entry on {formatDate(post.createdAt)}</span>
              <strong>{post.title || formatDate(post.createdAt)}</strong>
              <span class="memory-excerpt">…{excerpt}…</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
