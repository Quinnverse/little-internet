import { useState } from 'preact/hooks'
import {
  DAILY_GOALS,
  FIRST_DAY_STEPS,
  firstDayComplete,
  progress,
  type DailyGoal,
  type FirstDayStep,
  type Onboarding,
} from '../../core/onboarding.ts'
import { getLang } from '../i18n.ts'
import { Icon, type IconName } from './icons.tsx'

const COPY = {
  en: {
    dayOne: 'Your first day',
    dayOneSub: 'Boo will show you around. No rush — explore at your own pace.',
    hidden: 'Hide guide',
    done: 'All done — this home is yours now ✦',
    today: 'Today',
    dailySub: 'Small things, whenever you like',
    close: 'Close',
    steps: {
      walk: 'Walk around your home',
      diary: 'Write your first entry',
      pet: 'Say hello to Boo',
      decorate: 'Place or move one thing',
      website: 'Open your website studio',
      publish: 'Open the door for visitors',
    } as Record<FirstDayStep, string>,
    goals: {
      write: 'Write a little',
      company: 'Keep Boo company',
      neighbour: 'Visit a neighbour',
      mail: 'Open your mailbox',
    } as Record<DailyGoal, string>,
  },
  zh: {
    dayOne: '你的第一天',
    dayOneSub: 'Boo 带你四处看看。不用着急，按你的节奏来就好。',
    hidden: '收起引导',
    done: '都做到了——这个家现在真正属于你了 ✦',
    today: '今天',
    dailySub: '一些小事，想做的时候再做',
    close: '关闭',
    steps: {
      walk: '在家里四处走走',
      diary: '写下第一篇日记',
      pet: '和 Boo 打个招呼',
      decorate: '摆放或挪动一件东西',
      website: '打开你的网站工坊',
      publish: '为访客打开房门',
    } as Record<FirstDayStep, string>,
    goals: {
      write: '写一点东西',
      company: '陪陪 Boo',
      neighbour: '去邻居家看看',
      mail: '打开你的信箱',
    } as Record<DailyGoal, string>,
  },
}

const STEP_ICON: Record<FirstDayStep, IconName> = {
  walk: 'home',
  diary: 'pen',
  pet: 'ghost',
  decorate: 'sofa',
  website: 'palette',
  publish: 'door',
}
const GOAL_ICON: Record<DailyGoal, IconName> = {
  write: 'pen',
  company: 'ghost',
  neighbour: 'globe',
  mail: 'mail',
}

/** The gentle first-day task card + daily goals. Never blocks the scene. */
export function FirstDay(props: {
  onboarding: Onboarding
  onHide: () => void
}) {
  const zh = getLang() === 'zh'
  const c = zh ? COPY.zh : COPY.en
  const [open, setOpen] = useState(true)
  const o = props.onboarding
  const pct = Math.round(progress(o) * 100)
  const allDone = firstDayComplete(o)

  return (
    <aside class={`first-day${props.onboarding.dismissed ? ' is-hidden' : ''}`} aria-label={c.dayOne}>
      <div class="fd-head">
        <div>
          <strong>{c.dayOne}</strong>
          <p class="fd-sub">{c.dayOneSub}</p>
        </div>
        <button type="button" class="fd-collapse" onClick={() => setOpen((v) => !v)} aria-label={open ? c.hidden : c.dayOne}>
          <Icon name={open ? 'down' : 'up'} size={16} />
        </button>
      </div>

      {open && (
        <div class="fd-body">
          <div class="fd-progress" aria-label={`${pct}%`}>
            <span class="fd-bar" style={{ width: `${pct}%` }} />
          </div>
          <ol class="fd-steps">
            {FIRST_DAY_STEPS.map((s, i) => {
              const done = o.done.includes(s)
              return (
                <li key={s} class={done ? 'is-done' : i === o.done.length ? 'is-next' : ''}>
                  <span class="fd-check" aria-hidden="true">{done ? <Icon name="star" size={13} /> : <Icon name={STEP_ICON[s]} size={15} />}</span>
                  <span class="fd-label">{c.steps[s]}</span>
                </li>
              )
            })}
          </ol>
          {allDone && <p class="fd-complete">{c.done}</p>}

          <div class="fd-daily">
            <div class="fd-daily-title"><span>{c.today}</span><small>{c.dailySub}</small></div>
            <div class="fd-goals">
              {DAILY_GOALS.map((g) => {
                const done = o.daily.includes(g)
                return (
                  <span key={g} class={`fd-goal${done ? ' is-done' : ''}`} title={c.goals[g]}>
                    <Icon name={GOAL_ICON[g]} size={13} /> {c.goals[g]}
                  </span>
                )
              })}
            </div>
          </div>

          <button type="button" class="fd-hide" onClick={props.onHide}>{c.hidden}</button>
        </div>
      )}
    </aside>
  )
}
