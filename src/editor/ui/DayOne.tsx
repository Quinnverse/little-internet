import { useState } from 'preact/hooks'
import { t, useLang } from '../i18n.ts'
import { Icon } from './icons.tsx'

type Task = { id: 'write' | 'decorate' | 'publish'; label: string; done: boolean }

/**
 * Day one, as a small postcard on the table rather than a modal tour.
 *
 * It never blocks the room: three real tasks derived from the owner's own data,
 * each one a doorway into the existing flow. Dismissal is remembered for this home.
 */
export function DayOne(props: {
  slug: string
  posts: number
  decorated: boolean
  published: boolean
  onWrite: () => void
  onDecorate: () => void
  onPublish: () => void
}) {
  useLang()
  const key = `li-day1-${props.slug}`
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(key) === 'done'
    } catch {
      return true
    }
  })

  if (closed) return null
  // Demos and restored homes already have a life of their own; only fresh homes get day one.
  try {
    if (!localStorage.getItem(key)) return null
  } catch {
    return null
  }

  const tasks: Task[] = [
    { id: 'write', label: t('day1.t1'), done: props.posts > 0 },
    { id: 'decorate', label: t('day1.t2'), done: props.decorated },
    { id: 'publish', label: t('day1.t3'), done: props.published },
  ]
  const done = tasks.filter((x) => x.done).length
  const allDone = done === tasks.length

  const close = () => {
    try {
      localStorage.setItem(key, 'done')
    } catch {
      /* still closes for this visit */
    }
    setClosed(true)
  }

  const run = { write: props.onWrite, decorate: props.onDecorate, publish: props.onPublish }

  return (
    <aside class={`day1${allDone ? ' is-complete' : ''}`} aria-label={t('day1.title')}>
      <div class="day1-pin" aria-hidden="true" />
      <header class="day1-head">
        <div>
          <p class="day1-kicker">DAY 1</p>
          <h2>{t('day1.title')}</h2>
        </div>
        <button type="button" class="day1-x" onClick={close} aria-label={t('day1.later')} title={t('day1.later')}>
          <Icon name="close" size={16} />
        </button>
      </header>

      {allDone ? (
        <div class="day1-postcard">
          <p class="day1-wish">{t('day1.allDone')}</p>
          <button type="button" class="btn btn-primary" onClick={close}>{t('day1.close')}</button>
        </div>
      ) : (
        <>
          <p class="day1-sub">{t('day1.sub')}</p>
          <ul class="day1-list">
            {tasks.map((task) => (
              <li key={task.id} class={task.done ? 'is-done' : ''}>
                <button type="button" class="day1-task" onClick={run[task.id]} disabled={task.done}>
                  <span class="day1-check" aria-hidden="true">{task.done ? '✓' : ''}</span>
                  <span>{task.label}</span>
                  {!task.done && <span class="day1-arrow" aria-hidden="true">→</span>}
                </button>
                {task.done && <span class="sr-only">{t('day1.done')}</span>}
              </li>
            ))}
          </ul>
          <footer class="day1-foot">
            <div class="day1-bar" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done}>
              <span style={{ width: `${(done / 3) * 100}%` }} />
            </div>
            <span class="day1-count">{t('day1.progress', { n: done })}</span>
          </footer>
        </>
      )}
    </aside>
  )
}
