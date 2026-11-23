import { useEffect, useState } from 'preact/hooks'
import type { Project } from '../../core/schema.ts'
import { previewSupported, updatePreview } from '../preview.ts'
import { Icon } from './icons.tsx'

export function Preview(props: { project: Project; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!previewSupported()) return setError('Preview needs a browser with service workers.')
    let cancelled = false
    updatePreview(props.project).then(
      (url) => !cancelled && setSrc(url),
      (e) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [props.project])

  return (
    <div class="preview" role="dialog" aria-modal="true" aria-label="Visitor preview">
      <div class="preview-bar">
        <span><Icon name="eye" size={18} /> What visitors see — public content only</span>
        <button type="button" class="btn" onClick={props.onClose}>Done</button>
      </div>
      {error && <p class="error" role="alert">{error}</p>}
      {src && <iframe class="preview-frame" src={src} title="Visitor preview" />}
    </div>
  )
}
