import { useCallback, useRef, useState } from 'preact/hooks'
import { saveBytes } from '../download.ts'
import { useProjectStore } from '../store.ts'
import type { Ctx } from './common.tsx'
import { Diary } from './Diary.tsx'
import { Door } from './Door.tsx'
import { Preview } from './Preview.tsx'
import { Room } from './Room.tsx'
import { Settings } from './Settings.tsx'
import { Setup } from './Setup.tsx'
import { Icon, type IconName } from './icons.tsx'

type Tab = 'room' | 'diary' | 'door' | 'settings'

const TABS: Array<[Tab, IconName, string]> = [
  ['room', 'home', 'Room'],
  ['diary', 'book', 'Diary'],
  ['door', 'door', 'Door'],
  ['settings', 'gear', 'Settings'],
]

type Toast = { msg: string; kind: 'ok' | 'error'; n: number }

export function App() {
  const store = useProjectStore()
  const [tab, setTab] = useState<Tab>('room')
  const [previewing, setPreviewing] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    window.clearTimeout(toastTimer.current)
    setToast((t) => ({ msg, kind, n: (t?.n ?? 0) + 1 }))
    toastTimer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000)
  }, [])

  const { state } = store

  if (state.status === 'loading') return <div class="splash" aria-busy="true">Opening the door…</div>

  if (state.status === 'corrupt') {
    return (
      <main class="setup">
        <h1>We could not read your saved home</h1>
        <p class="error">{state.reason}</p>
        <p>Nothing has been deleted. Download the raw data before trying anything else.</p>
        <button
          type="button"
          class="btn btn-primary"
          onClick={() =>
            saveBytes(
              new TextEncoder().encode(JSON.stringify(state.raw, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v))),
              'little-internet-raw.json',
              'application/json',
            )
          }
        >
          Download raw data
        </button>
      </main>
    )
  }

  if (state.status === 'empty') return <Setup onDone={store.replace} />

  const ctx: Ctx = { project: state.project, apply: store.apply, replace: store.replace, toast: showToast }

  return (
    <div class="app">
      <header class="topbar">
        <span class="topbar-title">{state.project.site.title}</span>
        <button type="button" class="btn btn-small" onClick={() => setPreviewing(true)}>
          <Icon name="eye" size={18} /> Preview
        </button>
      </header>

      <main class="content">
        {tab === 'room' && <Room ctx={ctx} />}
        {tab === 'diary' && <Diary ctx={ctx} />}
        {tab === 'door' && <Door ctx={ctx} />}
        {tab === 'settings' && <Settings ctx={ctx} />}
      </main>

      <nav class="tabbar" aria-label="Main">
        {TABS.map(([id, icon, label]) => (
          <button type="button" key={id} class={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <Icon name={icon} size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {previewing && <Preview project={state.project} onClose={() => setPreviewing(false)} />}
      {(toast || store.saveError) && (
        <div class={`toast toast-${store.saveError ? 'error' : toast!.kind}`} role="status" key={toast?.n}>
          {store.saveError ?? toast!.msg}
        </div>
      )}
    </div>
  )
}
