import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { parseProject, type Project, type Result } from '../core/schema.ts'
import type { Command } from './commands.ts'
import { idbGet, idbSet } from './idb.ts'

const KEY = 'project'

export type StoreState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; project: Project }
  | { status: 'corrupt'; raw: unknown; reason: string }

export type Store = {
  state: StoreState
  /** Runs a command; keeps the old project and returns the reason if the result is invalid. */
  apply: (cmd: Command) => Result<Project>
  /** Replaces the whole project (setup, import, restore). Validates first. */
  replace: (p: Project) => Result<Project>
  saveError: string | null
}

export function useProjectStore(): Store {
  const [state, setState] = useState<StoreState>({ status: 'loading' })
  const [saveError, setSaveError] = useState<string | null>(null)
  const current = useRef<Project | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    idbGet<unknown>(KEY)
      .then((raw) => {
        if (cancelled) return
        if (raw === undefined) return setState({ status: 'empty' })
        const r = parseProject(raw)
        if (r.ok) {
          current.current = r.value
          setState({ status: 'ready', project: r.value })
        } else {
          // Never overwrite data we cannot read (Requirement 2.2).
          setState({ status: 'corrupt', raw, reason: r.reason })
        }
      })
      .catch((e) => !cancelled && setState({ status: 'corrupt', raw: null, reason: String(e) }))
    navigator.storage?.persist?.().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const scheduleSave = useCallback((p: Project) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      idbSet(KEY, p).then(
        () => setSaveError(null),
        (e) => setSaveError(`Could not save on this device: ${String(e)}`),
      )
    }, 300)
  }, [])

  // Flush pending save when the page is hidden (mobile browsers may kill it).
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' && current.current) {
        window.clearTimeout(timer.current)
        idbSet(KEY, current.current).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
  }, [])

  const commit = useCallback(
    (next: Project): Result<Project> => {
      const r = parseProject(next)
      if (!r.ok) return r
      current.current = r.value
      setState({ status: 'ready', project: r.value })
      scheduleSave(r.value)
      return r
    },
    [scheduleSave],
  )

  const apply = useCallback(
    (cmd: Command): Result<Project> => {
      if (!current.current) return { ok: false, reason: 'Nothing loaded yet.' }
      try {
        return commit(cmd(current.current))
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) }
      }
    },
    [commit],
  )

  return { state, apply, replace: commit, saveError }
}
