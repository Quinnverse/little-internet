import { useEffect, useState } from 'preact/hooks'
import type { Project } from '../../core/schema.ts'
import { t, useLang } from '../i18n.ts'
import { previewSupported, updatePreview } from '../preview.ts'
import { Icon } from './icons.tsx'

export function Preview(props: { project: Project; onClose: () => void }) {
  useLang()
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!previewSupported()) return setError(t('preview.needSw'))
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
    <div class="preview" role="dialog" aria-modal="true" aria-label={t('preview.title')}>
      <div class="preview-bar">
        <span><Icon name="eye" size={18} /> {t('preview.bar')}</span>
        <button type="button" class="btn" onClick={props.onClose}>{t('common.done')}</button>
      </div>
      {error && <p class="error" role="alert">{error}</p>}
      {src && <iframe class="preview-frame" src={src} title={t('preview.title')} />}
    </div>
  )
}
