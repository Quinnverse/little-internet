import { useState } from 'preact/hooks'
import { DAILY_GOALS, type DailyGoal, type Onboarding } from '../../core/onboarding.ts'
import { getLang } from '../i18n.ts'
import { Icon, type IconName } from './icons.tsx'

const COPY = {
  en: {
    title: 'Today',
    sub: 'Little things, whenever you like',
    goals: {
      write: 'Write a little',
      company: 'Keep Boo company',
      neighbour: 'Visit a neighbour',
      mail: 'Open your mailbox',
    } as Record<DailyGoal, string>,
  },
  zh: {
    title: '今天',
    sub: '一些小事，想做的时候再做',
    goals: {
      write: '写一点东西',
      company: '陪陪 Boo',
      neighbour: '去邻居家看看',
      mail: '打开你的信箱',
    } as Record<DailyGoal, string>,
  },
}

const GOAL_ICON: Record<DailyGoal, IconName> = {
  write: 'pen',
  company: 'ghost',
  neighbour: 'globe',
  mail: 'mail',
}

/** Gentle daily goals on the left — a quiet counterweight to the first-day card. */
export function DailyGoals(props: { onboarding: Onboarding }) {
  const zh = getLang() === 'zh'
  const c = zh ? COPY.zh : COPY.en
  const [open, setOpen] = useState(true)
  const o = props.onboarding
  const completed = o.daily.length
  return (
    <aside class={`daily-goals${open ? '' : ' is-collapsed'}`} aria-label={c.title}>
      <button type="button" class="dg-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span class="dg-t">{c.title}</span>
        <span class="dg-count">{completed}/{DAILY_GOALS.length}</span>
        <Icon name={open ? 'up' : 'down'} size={14} />
      </button>
      {open && (
        <div class="dg-body">
          <p class="dg-sub">{c.sub}</p>
          <ul class="dg-list">
            {DAILY_GOALS.map((g) => {
              const done = o.daily.includes(g)
              return (
                <li key={g} class={done ? 'is-done' : ''}>
                  <span class="dg-ico"><Icon name={GOAL_ICON[g]} size={14} /></span>
                  <span>{c.goals[g]}</span>
                  {done && <span class="dg-tick" aria-hidden="true">✦</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}
