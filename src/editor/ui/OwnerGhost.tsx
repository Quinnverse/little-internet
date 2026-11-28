import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { EMPTY_CONTEXT, understand, type BooAction, type BooCard, type BooContext, type BooProposal, type BooReply } from '../../core/boo.ts'
import { getLang } from '../i18n.ts'
import type { Post } from '../../core/schema.ts'
import { addTagToMany, setManyVisibility, toggleStar } from '../commands.ts'
import { converse } from '../people.ts'
import { t, useLang } from '../i18n.ts'
import { ta } from '../i18nAtelier.ts'
import { freeSlotsAll } from '../../core/room.ts'
import { GhostIcon, Sheet, type Ctx } from './common.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { Icon } from './icons.tsx'
import { CameraControl } from './CameraControl.tsx'
import type { BooReaction } from '../../perception/router.ts'

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
export function OwnerGhost(props: { ctx: Ctx; onClose: () => void; onWrite?: () => void; onDecorate?: () => void; onReact?: (r: BooReaction) => void }) {
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
  const [model,setModel] = useState(()=>{try{return localStorage.getItem('boo-chat-consent:'+ctx.project.site.slug)==='yes'}catch{return false}})
  const [share,setShare] = useState(false)
  const [modelError,setModelError] = useState(false)
  const chat = useRef<{role:string;content:string}[]>([])
  const [showVoice, setShowVoice] = useState(true)
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
    let warm = out.reply.text
    setModelError(false)
    if(model){
      const messages=[...chat.current.slice(-10),{role:'user',content:q}]
      try {
        warm=await converse(ctx.project.site.slug,messages,share?out.reply.cards.slice(0,3).map(c=>c.title+' · '+c.date+' · '+c.excerpt).join('\n'):'')
        chat.current=[...messages,{role:'assistant',content:warm.slice(0,2000)}]
      } catch {setModelError(true)}
    }
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

  return (
    <Sheet title={name} onClose={props.onClose}>
      <div class="owner-ghost-head">
        <GhostIcon color={ghost.color} size={56} />
        <div>
          <p>
            <strong>{t('pet.hi', { name })}</strong>
          </p>
          <p class="muted small">
            <Icon name="lock" size={13} /> {model && !modelError ? (lang==='zh'?'模型对话':'Model chat') : t('pet.local')}
          </p>
        </div>
      </div>

      <CameraControl
        mode="boo"
        hint={ta('cam.booHint')}
        onAction={(a) => {
          if (a.kind !== 'boo') return
          props.onReact?.(a.reaction)
          if (a.reaction === 'catch-heart') ctx.toast(ta('cam.booCaught'))
        }}
      />

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

      {modelError && <p role="status">{lang==='zh'?'模型未连接，本条使用本地检索。':'Model unavailable. This reply used local search.'}</p>}
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
          <label><input type="checkbox" checked={model} onChange={e=>{chat.current=[];setModel(e.currentTarget.checked);try{localStorage.setItem('boo-chat-consent:'+ctx.project.site.slug,e.currentTarget.checked?'yes':'no')}catch{};setModelError(false)}}/>{lang==='zh'?'将对话发送给主人配置的模型':'Send this conversation to the configured model'}</label>
          {model && <label><input type="checkbox" checked={share} onChange={e=>{chat.current=[];setShare(e.currentTarget.checked)}}/>{lang==='zh'?'允许发送匹配档案的标题、日期和摘录':'Include matched archive titles, dates and excerpts'}</label>}
        </div>
      )}
    </Sheet>
  )
}
