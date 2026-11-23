import { render } from 'preact'
import { App } from './editor/ui/App.tsx'
import './style.css'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
    // Preview and offline use need the service worker; the editor still works without it.
  })
}

render(<App />, document.getElementById('app')!)
