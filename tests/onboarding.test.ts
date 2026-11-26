import { describe, expect, it } from 'vitest'
// Node test env has no localStorage; provide a minimal in-memory one so the
// storage-backed behaviour (including corrupt data) is actually exercised.
if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v) },
      removeItem: (k: string) => { m.delete(k) },
      clear: () => m.clear(),
    },
    configurable: true,
  })
}
import {
  COMPLETE_AFTER_WALKS,
  completeGoal,
  completeStep,
  firstDayComplete,
  loadOnboarding,
  localDay,
  notedWalk,
  progress,
  saveOnboarding,
} from '../src/core/onboarding.ts'

describe('first-day onboarding', () => {
  it('starts empty and never persists into the Project', () => {
    const key = `test-${Math.random()}`
    const o = loadOnboarding(key)
    expect(o.done).toEqual([])
    expect(o.introSeen).toBe(false)
    expect(o.daily).toEqual([])
  })

  it('counts walks and only completes the walk step after enough real moves', () => {
    let o = loadOnboarding('w')
    for (let i = 1; i < COMPLETE_AFTER_WALKS; i++) {
      o = notedWalk(o)
      expect(o.done).not.toContain('walk')
    }
    o = notedWalk(o)
    expect(o.done).toContain('walk')
    expect(progress(o)).toBeCloseTo(1 / 6)
  })

  it('does not double-count a completed step', () => {
    const once = completeStep(loadOnboarding('s'), 'diary')
    const twice = completeStep(once, 'diary')
    expect(twice.done).toEqual(['diary'])
  })

  it('completes only when every step is done', () => {
    let o = loadOnboarding('all')
    expect(firstDayComplete(o)).toBe(false)
    for (const s of ['walk', 'diary', 'pet', 'decorate', 'website', 'publish'] as const) o = completeStep(o, s)
    expect(firstDayComplete(o)).toBe(true)
    expect(progress(o)).toBe(1)
  })

  it('keeps daily goals for today and clears them on a new day', () => {
    const key = `d-${Math.random()}`
    let o = completeGoal(loadOnboarding(key), 'write')
    expect(o.daily).toContain('write')
    o = completeGoal(o, 'write')
    expect(o.daily.filter((x) => x === 'write').length).toBe(1)
    saveOnboarding(key, { ...o, day: '2000-01-01' })
    const next = loadOnboarding(key)
    expect(next.day).toBe(localDay())
    expect(next.daily).toEqual([])
  })

  it('ignores corrupt saved progress', () => {
    const key = `c-${Math.random()}`
    localStorage.setItem(`li-onboarding:${key}`, '{not json')
    const o = loadOnboarding(key)
    expect(o.done).toEqual([])
    expect(o.introSeen).toBe(false)
  })
})
