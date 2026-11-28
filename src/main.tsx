import { render } from 'preact'
import { App } from './editor/ui/App.tsx'
import './style.css'

declare const __VISION_RELEASE__:string

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js?vision='+__VISION_RELEASE__, { scope: './' }).catch(() => {
    // Preview and offline use need the service worker; the editor still works without it.
  })
}

render(<App />, document.getElementById('app')!)
