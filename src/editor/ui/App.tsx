import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { saveBytes } from '../download.ts'
import { setLang, t, useLang } from '../i18n.ts'
import { useProjectStore } from '../store.ts'
import type { Ctx } from './common.tsx'
import { Home } from './Home.tsx'
import { Prologue, coverSeen, markCoverSeen } from './Prologue.tsx'
import { Setup } from './Setup.tsx'

type Toast = { msg: string; kind: 'ok' | 'error'; n: number }

export function App() {
  useLang()
  const store = useProjectStore()
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  // ?cover=0 keeps automated walkthroughs and deep links from having to read the story first.
  const [cover, setCover] = useState(() => {
    if (typeof location === 'undefined') return false
    const flag = new URLSearchParams(location.search).get('cover')
    // ?cover=1 forces the story (screenshots); ?cover=0 or a headless walkthrough skips it.
    if (flag === '0' || (flag !== '1' && navigator.webdriver)) return false
    return !coverSeen()
  })
  const [demoIntent, setDemoIntent] = useState(false)

  const showToast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    window.clearTimeout(toastTimer.current)
    setToast((cur) => ({ msg, kind, n: (cur?.n ?? 0) + 1 }))
    toastTimer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000)
  }, [])

  const { state } = store
  const savedLang = state.status === 'ready' ? state.project.site.lang : undefined
  // A loaded home remembers its language; the owner's choice is stored with it.
  useEffect(() => {
    if (savedLang) setLang(savedLang)
  }, [savedLang])

  if (state.status === 'loading') return <div class="splash" aria-busy="true">{t('app.opening')}</div>

  if (state.status === 'corrupt') {
    return (
      <main class="setup setup-plain">
        <h1>{t('corrupt.title')}</h1>
        <p class="error">{state.reason}</p>
        <p>{t('corrupt.body')}</p>
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
          {t('corrupt.download')}
        </button>
      </main>
    )
  }

  const toasts = (toast || store.saveError) && (
    <div class={`toast toast-${store.saveError ? 'error' : toast!.kind}`} role="status" key={toast?.n}>
      {store.saveError ?? toast!.msg}
    </div>
  )

  if (state.status === 'empty') {
    if (cover) {
      return (
        <Prologue
          onStart={() => {
            markCoverSeen()
            setCover(false)
          }}
          onDemo={() => {
            markCoverSeen()
            setDemoIntent(true)
            setCover(false)
          }}
        />
      )
    }
    return (
      <>
        <Setup
          onDone={store.replace}
          onBack={() => setCover(true)}
          openDemos={demoIntent}
        />
        {toasts}
      </>
    )
  }

  const ctx: Ctx = { project: state.project, apply: store.apply, replace: store.replace, toast: showToast }
  return (
    <div class="app">
      <Home ctx={ctx} />
      {toasts}
    </div>
  )
}
