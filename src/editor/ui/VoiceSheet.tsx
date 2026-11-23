import { useEffect, useRef, useState } from 'preact/hooks'
import type { Recording } from '../../core/schema.ts'
import { addRecording, deleteRecording, setRecordingVisibility, setWelcome, updateRecording } from '../commands.ts'
import { pickFiles } from '../download.ts'
import { t, useLang } from '../i18n.ts'
import { randomId } from '../ids.ts'
import { readAudioFile } from '../audioFile.ts'
import { describeMicError, recordingSupported, startRecording, type Recorded, type RecorderHandle } from '../recorder.ts'
import { blobUrl, formatDate, Lock, run, Sheet, type Ctx } from './common.tsx'
import { Icon } from './icons.tsx'

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The answering machine: record or choose messages, pick the welcome, decide who hears them. */
export function VoiceSheet(props: { ctx: Ctx; onClose: () => void }) {
  useLang()
  const { ctx } = props
  const recordings = ctx.project.recordings
  const [rec, setRec] = useState<RecorderHandle | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const recRef = useRef<RecorderHandle | null>(null)
  recRef.current = rec

  useEffect(() => {
    if (!rec) return
    const timer = window.setInterval(() => setElapsed(performance.now() - rec.startedAt), 200)
    return () => window.clearInterval(timer)
  }, [rec])
  useEffect(() => () => recRef.current?.cancel(), [])

  const save = (r: Recorded) => {
    const id = randomId()
    const ok = run(
      ctx,
      addRecording({ id, title: '', createdAt: new Date().toISOString(), durationMs: r.durationMs, mime: r.mime, data: r.data }),
      t('voice.saved'),
    )
    if (ok) setError(null)
  }

  const finish = async (p: Promise<Recorded>) => {
    setRec(null)
    setElapsed(0)
    try {
      save(await p)
    } catch (e) {
      if ((e as Error).message !== 'cancelled') setError((e as Error).message)
    }
  }

  const start = async () => {
    setError(null)
    if (recordings.length >= 20) return setError(t('voice.full'))
    try {
      setRec(await startRecording((p) => finish(p)))
    } catch (e) {
      setError(describeMicError(e))
    }
  }

  const choose = async () => {
    setError(null)
    if (recordings.length >= 20) return setError(t('voice.full'))
    const [file] = await pickFiles('audio/*,.m4a,.mp3,.ogg,.opus,.webm')
    if (!file) return
    setBusy(true)
    try {
      save(await readAudioFile(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={t('voice.title')} onClose={props.onClose}>
      <p class="muted small">{t('voice.intro')}</p>

      <div class="recorder card">
        {rec ? (
          <>
            <span class="rec-dot" aria-hidden="true" />
            <span class="rec-time" aria-live="polite">{fmt(elapsed)} / 1:00</span>
            <button type="button" class="btn btn-primary" onClick={() => finish(rec.stop())}>{t('voice.stop')}</button>
            <button type="button" class="btn" onClick={() => { rec.cancel(); setRec(null); setElapsed(0) }}>{t('voice.discard')}</button>
          </>
        ) : (
          <>
            <button type="button" class="btn btn-primary" onClick={start} disabled={!recordingSupported() || busy}>
              <Icon name="mic" size={18} /> {t('voice.record')}
            </button>
            <button type="button" class="btn" onClick={choose} disabled={busy}>
              <Icon name="upload" size={18} /> {busy ? t('voice.reading') : t('voice.choose')}
            </button>
          </>
        )}
      </div>
      {!recordingSupported() && <p class="muted small">{t('voice.noRec')}</p>}
      {error && <p class="error" role="alert">{error}</p>}

      {recordings.length === 0 ? (
        <p class="muted">{t('voice.none')}</p>
      ) : (
        <ul class="rec-list">
          {recordings.map((r) => (
            <RecordingRow key={r.id} ctx={ctx} r={r} />
          ))}
        </ul>
      )}
    </Sheet>
  )
}

function RecordingRow(props: { ctx: Ctx; r: Recording }) {
  const { ctx, r } = props
  const [title, setTitle] = useState(r.title)
  const [openOn, setOpenOn] = useState(r.openOn ?? '')
  const priv = r.visibility === 'private'
  const isWelcome = ctx.project.room.welcomeRecordingId === r.id

  return (
    <li class={`rec-item card${isWelcome ? ' is-welcome' : ''}`}>
      <div class="rec-row">
        <input
          aria-label={t('voice.msgTitle')}
          value={title}
          maxLength={80}
          placeholder={t('voice.msgPh')}
          onInput={(e) => setTitle(e.currentTarget.value)}
          onBlur={() => title !== r.title && run(ctx, updateRecording(r.id, { title: title.trim() }))}
        />
        <button
          type="button"
          class="rec-door"
          aria-label={priv ? t('voice.letHear') : t('voice.makePrivate')}
          onClick={() => run(ctx, setRecordingVisibility(r.id, priv ? 'public' : 'private'), priv ? t('voice.nowHear') : t('voice.nowPrivate'))}
        >
          <Lock private={priv} />
        </button>
      </div>
      <audio controls preload="metadata" src={blobUrl(r.data, r.mime)} />
      <p class="muted small">
        {formatDate(r.createdAt)} · {fmt(r.durationMs)} · {r.mime.replace('audio/', '').toUpperCase()}
      </p>
      <div class="welcome-row">
        <button
          type="button"
          class={`chip ${isWelcome ? 'selected' : ''}`}
          aria-pressed={isWelcome}
          onClick={() => run(ctx, setWelcome(isWelcome ? null : r.id))}
        >
          <Icon name="phone" size={16} /> {isWelcome ? t('voice.isWelcome') : t('voice.useWelcome')}
        </button>
      </div>
      {isWelcome && <p class="muted small">{priv ? t('voice.welcomePrivate') : t('voice.welcomeHint')}</p>}
      <label class="field rec-open">
        <span class="field-label">{t('voice.openOn')}</span>
        <input
          type="date"
          value={openOn}
          onChange={(e) => {
            const v = e.currentTarget.value
            setOpenOn(v)
            run(ctx, updateRecording(r.id, { openOn: v || null }))
          }}
        />
        <span class="field-hint">{t('voice.openOnHint')}</span>
      </label>
      <div class="sheet-actions">
        <button
          type="button"
          class="btn btn-danger"
          onClick={() => confirm(t('voice.confirmDelete')) && run(ctx, deleteRecording(r.id), t('voice.deleted'))}
        >
          <Icon name="trash" size={16} /> {t('common.delete')}
        </button>
      </div>
    </li>
  )
}
