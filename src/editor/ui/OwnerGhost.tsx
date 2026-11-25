import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { EMPTY_CONTEXT, understand, type BooAction, type BooCard, type BooContext, type BooProposal, type BooReply } from '../../core/boo.ts'
import { getLang } from '../i18n.ts'
import type { Post } from '../../core/schema.ts'
import { addTagToMany, setManyVisibility, toggleStar } from '../commands.ts'
import { loadModelSettings, rephrase, saveModelSettings, endpointAllowed, type ModelSettings } from '../booModel.ts'
import { t, useLang } from '../i18n.ts'
import { ta } from '../i18nAtelier.ts'
import { freeSlotsAll } from '../../core/room.ts'
import { Field, GhostIcon, Sheet, type Ctx } from './common.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { Icon } from './icons.tsx'

type Turn = { who: 'me' | 'boo'; text: string; cards?: BooCard[]; proposal?: BooProposal; done?: 'confirmed' | 'cancelled' | undefined; chips?: string[]; open?: BooReply['open'] }

function applyAction(a: BooAction, posts: readonly Post[]) {
  switch (a.type) {
    case 'visibility':
      return setManyVisibility(a.ids, a.to)
    case 'tag':
      return addTagToMany(a.ids, a.tag)
    case 'star': {
      // toggleStar flips, so only flip the ones that are not starred yet.
      const todo = a.ids.filter((id) => !posts.find((p) => p.id === id)?.starred)
      return (p: import('../../core/schema.ts').Project) => todo.reduce((acc, id) => toggleStar(id)(acc), p)
    }
  }
}

/**
 * Boo, the owner's companion. Talks in free text, finds and counts records, understands follow-ups, and can
 * propose changes to several records at once. It always shows what would change and waits for a click.
 * Runs on this device. An optional model can only rephrase Boo's own answer (Settings → Boo's voice).
 */
export function OwnerGhost(props: { ctx: Ctx; onClose: () => void; onWrite?: () => void; onDecorate?: () => void }) {
  useLang()
  const { ctx } = props
  const { ghost, posts } = ctx.project
  const lang = getLang()
  const name = ghost.name || t('pet.fallback')
  const [open, setOpen] = useState<Post | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [bctx, setBctx] = useState<BooContext>(EMPTY_CONTEXT)
  const [settings, setSettings] = useState<ModelSettings>(() => loadModelSettings())
  const [showVoice, setShowVoice] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const freeSlots = useMemo(() => freeSlotsAll(ctx.project.room), [ctx.project.room])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns, busy])

  if (open) return <EntrySheet ctx={ctx} post={open} onClose={() => setOpen(null)} />

  const say = async (raw: string) => {
    const q = raw.trim()
    if (!q || busy) return
    setText('')
    const out = understand({ text: q, ctx: bctx, posts, lang, now: new Date(), name, freeSlots })
    setBctx(out.ctx)
    setTurns((cur) => [...cur, { who: 'me', text: q }])
    setBusy(true)
    const warm = settings.enabled ? await rephrase(settings, q, out.reply.text, out.reply.cards, name, lang) : out.reply.text
    setBusy(false)
    setTurns((cur) => [...cur, { who: 'boo', text: warm, cards: out.reply.cards, proposal: out.reply.proposal, chips: out.reply.chips, open: out.reply.open }])
    if (out.reply.open === 'write') props.onWrite?.()
  }

  const confirm = (index: number) => {
    const turn = turns[index]
    const prop = turn?.proposal
    if (!prop) return
    const cmd = applyAction(prop.action, posts)
    const r = ctx.apply(cmd)
    const mark = (x: Turn, i: number): Turn => (i === index ? { ...x, done: r.ok ? ('confirmed' as const) : ('cancelled' as const) } : x)
    const note: Turn = { who: 'boo', text: r.ok ? ta('boo.done', { n: prop.affected.length }) : r.reason }
    setTurns((cur) => [...cur.map(mark), note])
  }
  const cancel = (index: number) => {
    const mark = (x: Turn, i: number): Turn => (i === index ? { ...x, done: 'cancelled' as const } : x)
    const note: Turn = { who: 'boo', text: ta('boo.cancelled') }
    setTurns((cur) => [...cur.map(mark), note])
  }

  const chips = turns.length === 0 ? understand({ text: 'help', ctx: EMPTY_CONTEXT, posts, lang, now: new Date(), name }).reply.chips : (turns[turns.length - 1]!.chips ?? [])

  const updateSettings = (patch: Partial<ModelSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveModelSettings(next)
  }
  const badEndpoint = settings.endpoint !== '' && !endpointAllowed(settings.endpoint)

  return (
    <Sheet title={name} onClose={props.onClose}>
      <div class="owner-ghost-head">
        <GhostIcon color={ghost.color} size={56} />
        <div>
          <p>
            <strong>{t('pet.hi', { name })}</strong>
          </p>
          <p class="muted small">
            <Icon name="lock" size={13} /> {settings.enabled ? ta('boo.modelOn') : t('pet.local')}
          </p>
        </div>
      </div>

      <div class="boo-chat" role="log" aria-live="polite" aria-label={ta('boo.log')}>
        {turns.length === 0 && <p class="muted">{ta('boo.intro', { name })}</p>}
        {turns.map((turn, i) => (
          <div key={i} class={`boo-turn boo-${turn.who}`}>
            <p>{turn.text}</p>
            {turn.cards && turn.cards.length > 0 && (
              <ul class="memory-list">
                {turn.cards.map((c) => (
                  <li key={c.postId}>
                    <button type="button" onClick={() => setOpen(posts.find((p) => p.id === c.postId) ?? null)}>
                      <span class="memory-date">
                        {c.date} · {ta(`k.${c.kind}`)} · {c.visibility === 'private' ? t('entry.private') : t('entry.public')}
                      </span>
                      <strong>{c.title}</strong>
                      <span class="memory-excerpt">{c.excerpt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {turn.proposal && (
              <div class={`boo-proposal${turn.done ? ` is-${turn.done}` : ''}`}>
                <p>
                  <strong>{turn.proposal.summary}</strong>
                </p>
                <ul class="boo-affected">
                  {turn.proposal.affected.map((c) => (
                    <li key={c.postId}>
                      {c.title} <span class="muted small">· {c.date} · {c.visibility === 'private' ? t('entry.private') : t('entry.public')}</span>
                    </li>
                  ))}
                </ul>
                {!turn.done ? (
                  <div class="choice-row">
                    <button type="button" class="btn btn-primary btn-small" onClick={() => confirm(i)}>{ta('boo.confirm', { n: turn.proposal.affected.length })}</button>
                    <button type="button" class="btn btn-small" onClick={() => cancel(i)}>{ta('boo.cancel')}</button>
                  </div>
                ) : (
                  <p class="muted small">{turn.done === 'confirmed' ? ta('boo.confirmed') : ta('boo.notDone')}</p>
                )}
              </div>
            )}
            {turn.open === 'decorate' && props.onDecorate && (
              <button type="button" class="btn btn-small" onClick={props.onDecorate}>{ta('boo.openDecorate')}</button>
            )}
          </div>
        ))}
        {busy && <p class="muted small">{ta('boo.thinking', { name })}</p>}
        <div ref={end} />
      </div>

      {chips.length > 0 && (
        <div class="boo-chips" role="group" aria-label={ta('boo.try')}>
          {chips.map((c) => (
            <button type="button" key={c} class="tag-chip" onClick={() => void say(c)}>{c}</button>
          ))}
        </div>
      )}

      <form
        class="boo-input"
        onSubmit={(e) => {
          e.preventDefault()
          void say(text)
        }}
      >
        <input value={text} maxLength={200} placeholder={ta('boo.ph', { name })} aria-label={ta('boo.ph', { name })} onInput={(e) => setText(e.currentTarget.value)} />
        <button type="submit" class="btn btn-primary" disabled={!text.trim() || busy}>{ta('boo.send')}</button>
      </form>

      <button type="button" class="btn btn-small" aria-expanded={showVoice} onClick={() => setShowVoice((v) => !v)}>
        {ta('boo.voice')}
      </button>
      {showVoice && (
        <div class="card boo-voice">
          <p class="small">{ta('boo.voiceBody')}</p>
          <label class="switch-row">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => updateSettings({ enabled: e.currentTarget.checked })} />
            <span>{ta('boo.modelUse')}</span>
          </label>
          {settings.enabled && (
            <>
              <Field label={ta('boo.endpoint')} hint={badEndpoint ? ta('boo.endpointBad') : ta('boo.endpointHint')}>
                <input value={settings.endpoint} inputMode="url" autocapitalize="off" aria-invalid={badEndpoint} placeholder="https://…/v1/chat/completions" onInput={(e) => updateSettings({ endpoint: e.currentTarget.value.trim() })} />
              </Field>
              <Field label={ta('boo.modelName')}>
                <input value={settings.model} placeholder="model" onInput={(e) => updateSettings({ model: e.currentTarget.value.trim() })} />
              </Field>
              <Field label={ta('boo.apiKey')} hint={ta('boo.apiKeyHint')}>
                <input type="password" value={settings.apiKey} autocomplete="off" onInput={(e) => updateSettings({ apiKey: e.currentTarget.value })} />
              </Field>
              <label class="switch-row">
                <input type="checkbox" checked={settings.sendRecordText} onChange={(e) => updateSettings({ sendRecordText: e.currentTarget.checked })} />
                <span>{ta('boo.sendRecords')}</span>
              </label>
              <p class="muted small">{settings.sendRecordText ? ta('boo.sendsRecords') : ta('boo.sendsQuestionOnly')}</p>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}
