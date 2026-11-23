import { useEffect, useRef, useState } from 'preact/hooks'
import type { Recording } from '../../core/schema.ts'
import { addRecording, deleteRecording, setRecordingVisibility, updateRecording } from '../commands.ts'
import { pickFiles } from '../download.ts'
import { randomId } from '../ids.ts'
import { readAudioFile } from '../audioFile.ts'
import { describeMicError, recordingSupported, startRecording, type Recorded, type RecorderHandle } from '../recorder.ts'
import { blobUrl, formatDate, Lock, run, Sheet, type Ctx } from './common.tsx'
import { Icon } from './icons.tsx'

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The answering machine: record or choose messages, decide who hears them. */
export function VoiceSheet(props: { ctx: Ctx; onClose: () => void }) {
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
    const t = window.setInterval(() => setElapsed(performance.now() - rec.startedAt), 200)
    return () => window.clearInterval(t)
  }, [rec])
  useEffect(() => () => recRef.current?.cancel(), [])

  const save = (r: Recorded) => {
    const ok = run(
      ctx,
      addRecording({ id: randomId(), title: '', createdAt: new Date().toISOString(), durationMs: r.durationMs, mime: r.mime, data: r.data }),
      'Message saved. Only you can hear it until you open the door.',
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
    if (recordings.length >= 20) return setError('The answering machine holds 20 messages. Delete one first.')
    try {
      setRec(await startRecording((p) => finish(p)))
    } catch (e) {
      setError(describeMicError(e))
    }
  }

  const choose = async () => {
    setError(null)
    if (recordings.length >= 20) return setError('The answering machine holds 20 messages. Delete one first.')
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
    <Sheet title="Answering machine" onClose={props.onClose}>
      <p class="muted small">Leave messages in your own voice for whoever visits — now, or long after.</p>

      <div class="recorder card">
        {rec ? (
          <>
            <span class="rec-dot" aria-hidden="true" />
            <span class="rec-time" aria-live="polite">{fmt(elapsed)} / 1:00</span>
            <button type="button" class="btn btn-primary" onClick={() => finish(rec.stop())}>Stop &amp; keep</button>
            <button type="button" class="btn" onClick={() => { rec.cancel(); setRec(null); setElapsed(0) }}>Discard</button>
          </>
        ) : (
          <>
            <button type="button" class="btn btn-primary" onClick={start} disabled={!recordingSupported() || busy}>
              <Icon name="mic" size={18} /> Record a message
            </button>
            <button type="button" class="btn" onClick={choose} disabled={busy}>
              <Icon name="upload" size={18} /> {busy ? 'Reading…' : 'Choose audio file'}
            </button>
          </>
        )}
      </div>
      {!recordingSupported() && <p class="muted small">Recording isn’t available in this browser or on this page; you can still choose a file.</p>}
      {error && <p class="error" role="alert">{error}</p>}

      {recordings.length === 0 ? (
        <p class="muted">No messages yet.</p>
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

  return (
    <li class="rec-item card">
      <div class="rec-row">
        <input
          aria-label="Message title"
          value={title}
          maxLength={80}
          placeholder="A message"
          onInput={(e) => setTitle(e.currentTarget.value)}
          onBlur={() => title !== r.title && run(ctx, updateRecording(r.id, { title: title.trim() }))}
        />
        <button
          type="button"
          class="rec-door"
          aria-label={priv ? 'Let visitors hear this' : 'Make private'}
          onClick={() => run(ctx, setRecordingVisibility(r.id, priv ? 'public' : 'private'), priv ? 'Visitors can now hear this message.' : 'This message is private again.')}
        >
          <Lock private={priv} />
        </button>
      </div>
      <audio controls preload="metadata" src={blobUrl(r.data, r.mime)} />
      <p class="muted small">
        {formatDate(r.createdAt)} · {fmt(r.durationMs)} · {r.mime.replace('audio/', '').toUpperCase()}
      </p>
      <label class="field rec-open">
        <span class="field-label">Open on (optional)</span>
        <input
          type="date"
          value={openOn}
          onChange={(e) => {
            const v = e.currentTarget.value
            setOpenOn(v)
            run(ctx, updateRecording(r.id, { openOn: v || null }))
          }}
        />
        <span class="field-hint">A label for visitors, not a lock: anyone who opens your site can listen to public messages.</span>
      </label>
      <div class="sheet-actions">
        <button
          type="button"
          class="btn btn-danger"
          onClick={() => confirm('Delete this message? This cannot be undone.') && run(ctx, deleteRecording(r.id), 'Message deleted.')}
        >
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
    </li>
  )
}
