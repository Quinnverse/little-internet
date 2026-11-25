import { useMemo, useState } from 'preact/hooks'
import type { Post } from '../../core/schema.ts'
import { t, useLang } from '../i18n.ts'
import { askMemories, onThisDay } from '../memories.ts'
import { Field, formatDate, GhostIcon, Sheet, type Ctx } from './common.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { Icon } from './icons.tsx'

/** Owner-only ghost: memories from the owner's own entries, computed on the device. */
export function OwnerGhost(props: { ctx: Ctx; onClose: () => void }) {
  useLang()
  const { ctx } = props
  const { ghost, posts } = ctx.project
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Post | null>(null)
  const today = useMemo(() => onThisDay(posts, new Date()), [posts])
  const answers = useMemo(() => askMemories(posts, query), [posts, query])
  const name = ghost.name || t('pet.fallback')

  if (open) return <EntrySheet ctx={ctx} post={open} onClose={() => setOpen(null)} />

  return (
    <Sheet title={name} onClose={props.onClose}>
      <div class="owner-ghost-head">
        <GhostIcon color={ghost.color} size={56} />
        <div>
          <p>
            <strong>{t('pet.hi', { name })}</strong>
          </p>
          <p class="muted small">
            <Icon name="lock" size={13} /> {t('pet.local')}
          </p>
        </div>
      </div>

      <h3 class="owner-ghost-h">{t('pet.today')}</h3>
      {today.length === 0 ? (
        <p class="muted">{t('pet.todayNone')}</p>
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

      <h3 class="owner-ghost-h">{t('pet.ask', { name })}</h3>
      <Field label={t('pet.askLabel')}>
        <input value={query} maxLength={60} placeholder={t('pet.askPh')} onInput={(e) => setQuery(e.currentTarget.value)} />
      </Field>
      {query.trim() !== '' && answers.length === 0 && (
        <p class="muted">{t('pet.noMem', { q: query.trim() })}</p>
      )}
      <ul class="memory-list" aria-live="polite">
        {answers.map(({ post, excerpt }) => (
          <li key={post.id}>
            <button type="button" onClick={() => setOpen(post)}>
              <span class="memory-date">{t('pet.from', { date: formatDate(post.createdAt) })}</span>
              <strong>{post.title || formatDate(post.createdAt)}</strong>
              <span class="memory-excerpt">…{excerpt}…</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
