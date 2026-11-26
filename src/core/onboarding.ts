/**
 * First-day onboarding and gentle daily goals.
 *
 * Deliberately stored in localStorage, keyed by site slug — NOT in the Project.
 * Reason: onboarding is a device/owner preference, not part of the portable,
 * private-by-default home. Keeping it out of Project preserves backup/export
 * compatibility and the privacy model (a visitor never sees any of this).
 *
 * Nothing here is mandatory: every step can be skipped, goals never punish,
 * and there are no streaks or rewards tied to writing volume.
 */

export const FIRST_DAY_STEPS = ['walk', 'diary', 'pet', 'decorate', 'website', 'publish'] as const
export type FirstDayStep = (typeof FIRST_DAY_STEPS)[number]

export const DAILY_GOALS = ['write', 'company', 'neighbour', 'mail'] as const
export type DailyGoal = (typeof DAILY_GOALS)[number]

export type Onboarding = {
  introSeen: boolean
  dismissed: boolean
  done: FirstDayStep[]
  walkCount: number
  /** Local date (YYYY-MM-DD) the daily goals were last refreshed. */
  day: string
  daily: DailyGoal[]
}

export const EMPTY_ONBOARDING: Onboarding = {
  introSeen: false,
  dismissed: false,
  done: [],
  walkCount: 0,
  day: '',
  daily: [],
}

export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const key = (slug: string) => `li-onboarding:${slug}`

/**
 * A tiny in-memory stand-in so the pure logic also runs where localStorage is
 * absent (node tests, privacy-restricted browsers). Real browsers use the real
 * localStorage — nothing here ever reaches the server or the Project.
 */
const memory = new Map<string, string>()
const store = {
  get(k: string) {
    try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : memory.get(k) ?? null }
    catch { return memory.get(k) ?? null }
  },
  set(k: string, v: string) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(k, v)
      else memory.set(k, v)
    } catch { memory.set(k, v) }
  },
}

/** Read progress. Unknown/corrupt shapes fall back to the empty state. */
export function loadOnboarding(slug: string): Onboarding {
  try {
    const raw = store.get(key(slug))
    if (!raw) return { ...EMPTY_ONBOARDING, done: [], daily: [] }
    const o = JSON.parse(raw) as Partial<Onboarding>
    const done = Array.isArray(o.done) ? o.done.filter((x): x is FirstDayStep => FIRST_DAY_STEPS.includes(x as FirstDayStep)) : []
    const daily = Array.isArray(o.daily) ? o.daily.filter((x): x is DailyGoal => DAILY_GOALS.includes(x as DailyGoal)) : []
    const today = localDay()
    return {
      introSeen: o.introSeen === true,
      dismissed: o.dismissed === true,
      done: [...new Set(done)],
      walkCount: typeof o.walkCount === 'number' && o.walkCount >= 0 ? Math.floor(o.walkCount) : 0,
      day: o.day === today ? today : today,
      daily: o.day === today ? [...new Set(daily)] : [],
    }
  } catch {
    return { ...EMPTY_ONBOARDING, done: [], daily: [] }
  }
}

export function saveOnboarding(slug: string, o: Onboarding): void {
  store.set(key(slug), JSON.stringify(o))
}

export function completeStep(o: Onboarding, step: FirstDayStep): Onboarding {
  if (o.done.includes(step)) return o
  return { ...o, done: [...o.done, step] }
}

/** Three small walks count as "you have explored your home" — no precise gestures required. */
export const COMPLETE_AFTER_WALKS = 3
export function notedWalk(o: Onboarding): Onboarding {
  const walkCount = o.walkCount + 1
  return walkCount >= COMPLETE_AFTER_WALKS ? completeStep({ ...o, walkCount }, 'walk') : { ...o, walkCount }
}

export function completeGoal(o: Onboarding, goal: DailyGoal): Onboarding {
  const today = localDay()
  const base = o.day === today ? o : { ...o, day: today, daily: [] }
  if (base.daily.includes(goal)) return base
  return { ...base, daily: [...base.daily, goal] }
}

export function firstDayComplete(o: Onboarding): boolean {
  return FIRST_DAY_STEPS.every((s) => o.done.includes(s))
}

/** Progress 0..1 for the task card. */
export function progress(o: Onboarding): number {
  return o.done.length / FIRST_DAY_STEPS.length
}
