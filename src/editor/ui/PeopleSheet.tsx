import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { letterSummary, letterText, letterToSvg, type Letter } from '../../core/letter.ts'
import type { Drawing } from '../../core/strokes.ts'
import * as D from '../../core/designOps.ts'
import { paintStrokes } from './DrawPad.tsx'
import { addAsset, addPost, compose, design as designCmd, keepGift, placeGiftFrame, setPostObject } from '../commands.ts'
import { getLang } from '../i18n.ts'
import { ta } from '../i18nAtelier.ts'
import { randomId } from '../ids.ts'
import { letterToPng } from '../letterMedia.ts'
import {
  PeopleError,
  answerFriend,
  blockPerson,
  claim,
  deleteMail,
  flushOutbox,
  friends as loadFriends,
  inbox as loadInbox,
  loadOutbox,
  markRead,
  openMail,
  removeFriend,
  requestFriend,
  saveOutbox,
  sendQueued,
  sent as loadSent,
  unblockPerson,
  type Friends,
  type FullMail,
  type MailItem,
  type Pending,
  type SentItem,
} from '../people.ts'
import { savedServer } from '../publish.ts'
import { Sheet, run, type Ctx } from './common.tsx'
import { Icon } from './icons.tsx'
import { LetterAtelier, template } from './LetterAtelier.tsx'

export const PEOPLE_ON = 'li-people-on'
type Tab = 'inbox' | 'friends' | 'sent'

const why = (e: unknown) => (e instanceof PeopleError && e.status === 0 ? ta('mail.offline') : e instanceof Error ? e.message : String(e))

export function PeopleSheet(props: { ctx: Ctx; onClose: () => void; onUnread: (n: number) => void; onKept?: () => void; startTab?: Tab; heartDraft?:boolean }) {
  const { ctx } = props
  const slug = ctx.project.site.slug
  const server = savedServer()
  const [tab, setTab] = useState<Tab>(props.startTab ?? 'inbox')
  const [ready, setReady] = useState<'wait' | 'ok' | 'fail'>('wait')
  const [err, setErr] = useState('')
  const [fr, setFr] = useState<Friends>({ friends: [], incoming: [], outgoing: [], blocked: [] })
  const [mail, setMail] = useState<MailItem[]>([])
  const [sentList, setSentList] = useState<SentItem[]>([])
  const [outbox, setOutbox] = useState<Pending[]>([])
  const [open, setOpen] = useState<FullMail | null>(null)
  const [writing, setWriting] = useState<{ to?: string; letter?: Letter } | null>(()=>props.heartDraft?{letter:template('heart')}:null)
  const [who, setWho] = useState('')
  const [note, setNote] = useState('')
  const alive = useRef(true)

  /** Keep a drawing as a private archive entry and hang it in the room as a keepsake. */
  const keepDrawing = (d: Drawing) => {
    if (!d.strokes.length) return
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const g = c.getContext('2d')
    if (!g) return
    paintStrokes(g, 512, d.strokes)
    c.toBlob((blob) => {
      if (!blob) return
      void blob.arrayBuffer().then((buf) => {
        const assetId = randomId()
        const postId = randomId()
        const title = getLang() === 'zh' ? '我的空中绘画' : 'My air drawing'
        const r = ctx.apply(compose(
          addAsset({ id: assetId, mime: 'image/png', data: new Uint8Array(buf) }),
          addPost({ id: postId, createdAt: new Date().toISOString(), title, body: ' ', imageIds: [assetId], kind: 'collection' }),
          setPostObject(postId, 'photo', randomId()),
        ))
        ctx.toast(r.ok ? (getLang() === 'zh' ? '涂鸦已收藏，并挂进了房间' : 'Drawing kept and hung in your room') : r.reason, r.ok ? 'ok' : 'error')
      })
    }, 'image/png')
  }

  /** Turn a finished drawing into a website sticker asset, reusable in the Web Atelier. */
  const saveSticker = (d: Drawing) => {
    if (!d.strokes.length) return
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const g = c.getContext('2d')
    if (!g) return
    paintStrokes(g, 512, d.strokes)
    c.toBlob((blob) => {
      if (!blob) return
      void blob.arrayBuffer().then((buf) => {
        const id = randomId()
        const r = ctx.apply(compose(
          addAsset({ id, mime: 'image/png', data: new Uint8Array(buf) }),
          designCmd(D.addDecoration({ id, kind: 'sticker', name: getLang() === 'zh' ? '手绘贴纸' : 'Hand-drawn sticker' })),
        ))
        ctx.toast(r.ok ? (getLang() === 'zh' ? '贴纸已保存，去网站工坊的贴纸组件选用它' : 'Sticker saved — pick it in the website studio') : r.reason, r.ok ? 'ok' : 'error')
      })
    }, 'image/png')
  }

  const refresh = useCallback(async () => {
    try {
      const [f, m, s] = await Promise.all([loadFriends(slug, server), loadInbox(slug, server), loadSent(slug, server)])
      if (!alive.current) return
      setFr(f)
      setMail(m.mail)
      setSentList(s.sent)
      setErr('')
      props.onUnread(m.mail.filter((x) => x.unread).length)
    } catch (e) {
      if (alive.current) setErr(why(e))
    }
    if (alive.current) setOutbox(await loadOutbox())
  }, [slug, server])

  useEffect(() => {
    alive.current = true
    ;(async () => {
      try {
        await claim(slug, server)
        try {
          localStorage.setItem(PEOPLE_ON, '1')
        } catch {
          /* ignore */
        }
        if (!alive.current) return
        setReady('ok')
        await flushOutbox(slug, server)
        await refresh()
      } catch (e) {
        if (!alive.current) return
        setReady('fail')
        setErr(why(e))
        setOutbox(await loadOutbox())
      }
    })()
    const id = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), 20_000)
    return () => {
      alive.current = false
      window.clearInterval(id)
    }
  }, [slug, server])

  const guard = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn()
      if (okMsg) ctx.toast(okMsg)
      await refresh()
      return true
    } catch (e) {
      ctx.toast(why(e), 'error')
      return false
    }
  }

  const unread = mail.filter((m) => m.unread).length
  const keptMailIds = new Set(ctx.project.gifts.map((g) => g.mailId))

  const open1 = async (id: string) => {
    try {
      const full = await openMail(slug, server, id)
      setOpen(full)
      await markRead(slug, server, id).catch(() => {})
      void refresh()
    } catch (e) {
      ctx.toast(why(e), 'error')
    }
  }

  /** Keeps the letter in the Life Archive as a private gift. Returns the post id, or null when it failed. */
  const keep = async (m: FullMail): Promise<string | null> => {
    const have = ctx.project.gifts.find((g) => g.mailId === m.id)
    if (have) return have.postId
    try {
      const png = await letterToPng(m.letter)
      const from = fr.friends.find((f) => f.slug === m.from)
      const postId = randomId()
      const ok = run(
        ctx,
        keepGift({
          postId,
          giftId: randomId(),
          assetId: randomId(),
          png,
          mailId: m.id,
          from: m.from,
          fromTitle: from?.title || m.from,
          receivedAt: m.createdAt,
          shareable: m.shareable,
          letter: m.letter,
          title: ta('mail.giftTitle', { from: from?.title || m.from }),
          body: letterText(m.letter) || letterSummary(m.letter, getLang()),
        }),
      )
      return ok ? postId : null
    } catch (e) {
      ctx.toast((e as Error).message, 'error')
      return null
    }
  }

  if (writing) {
    return (
      <LetterAtelier
        slug={slug}
        server={server}
        friends={fr.friends}
        {...(writing.letter ? { initial: writing.letter } : {})}
        {...(writing.to ? { initialTo: writing.to } : {})}
        toast={ctx.toast}
        onSaveSticker={saveSticker}
        onKeepDrawing={keepDrawing}
        onClose={() => {
          setWriting(null)
          void refresh()
        }}
        onSent={() => void refresh()}
      />
    )
  }

  if (open) {
    const kept = keptMailIds.has(open.id)
    const hasObject = ctx.project.gifts.some((g) => g.mailId === open.id && ctx.project.room.memory.some((o) => o.postId === g.postId && o.slot.startsWith('wall-')))
    const fromName = fr.friends.find((f) => f.slug === open.from)?.title || open.from
    return (
      <Sheet title={ta('mail.from', { from: fromName })} onClose={() => setOpen(null)} wide>
        <div class="letter-send">
          <div class="letter-preview letter-open" dangerouslySetInnerHTML={{ __html: letterToSvg(open.letter, { width: 360 }) }} role="img" aria-label={letterSummary(open.letter, getLang()) || ta('let.title')} />
          <div class="letter-send-form">
            {open.letter.voice && <audio controls preload="none" src={open.letter.voice.data} aria-label={ta('let.voice')} />}
            <p class="muted small">{open.shareable ? ta('mail.mayShare') : ta('mail.noShare')}</p>
            <div class="choice-row">
              <button
                type="button"
                class="btn btn-primary"
                disabled={kept}
                onClick={async () => {
                  const id = await keep(open)
                  if (id) {
                    ctx.toast(ta('mail.kept'))
                    props.onKept?.()
                  }
                }}
              >
                <Icon name="book" size={18} /> {kept ? ta('mail.alreadyKept') : ta('mail.keep')}
              </button>
              <button
                type="button"
                class="btn"
                disabled={hasObject}
                onClick={async () => {
                  const id = await keep(open)
                  if (!id) return
                  if (run(ctx, placeGiftFrame(id, 'wall', randomId()), ta('mail.framed'))) props.onKept?.()
                }}
              >
                <Icon name="photo" size={18} /> {hasObject ? ta('mail.onWall') : ta('mail.frame')}
              </button>
              {kept && (['desk','shelf','cabinet'] as const).map(group => (
                <button type="button" class="btn" onClick={() => {
                  const gift = ctx.project.gifts.find(g => g.mailId === open.id)
                  if (gift) run(ctx, placeGiftFrame(gift.postId, group, randomId()), ta('mail.framed'))
                }}>{getLang() === 'zh'
                  ? (group === 'desk' ? '摆到书桌' : group === 'shelf' ? '放上收藏架' : '放进收藏柜')
                  : (group === 'desk' ? 'Frame on desk' : group === 'shelf' ? 'Frame on shelf' : 'Keep in cabinet')}</button>
              ))}
              <button type="button" class="btn" onClick={() => (setOpen(null), setWriting({ to: open.from, letter: template('thinking') }))}>
                <Icon name="mail" size={18} /> {ta('mail.reply')}
              </button>
            </div>
            <div class="choice-row">
              <button
                type="button"
                class="btn btn-small"
                onClick={async () => {
                  if (kept && !window.confirm(ta('mail.deleteKeptConfirm'))) return
                  if (await guard(() => deleteMail(slug, server, open.id), ta('mail.deleted'))) setOpen(null)
                }}
              >
                <Icon name="trash" size={16} /> {ta('mail.delete')}
              </button>
              <button
                type="button"
                class="btn btn-small"
                onClick={async () => {
                  if (!window.confirm(ta('mail.blockConfirm', { who: fromName }))) return
                  if (await guard(() => blockPerson(slug, server, open.from), ta('mail.blocked'))) setOpen(null)
                }}
              >
                {ta('mail.block')}
              </button>
            </div>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={ta('mail.title')} onClose={props.onClose} wide>
      <div class="people">
        <p class="muted small">{ta('mail.privacy')}</p>
        {ready === 'wait' && <p class="muted" role="status">{ta('mail.connecting')}</p>}
        {err && (
          <p class="error small" role="alert">
            {err} <button type="button" class="btn btn-small" onClick={() => void refresh()}>{ta('let.retry')}</button>
          </p>
        )}
        <div class="choice-row" role="tablist">
          {(['inbox', 'friends', 'sent'] as const).map((k) => (
            <button type="button" role="tab" key={k} aria-selected={tab === k} class={`chip${tab === k ? ' selected' : ''}`} onClick={() => setTab(k)}>
              {ta(`mail.tab.${k}`)}
              {k === 'inbox' && unread > 0 && <span class="badge-count" aria-label={ta('mail.unread', { n: unread })}>{unread}</span>}
              {k === 'friends' && fr.incoming.length > 0 && <span class="badge-count">{fr.incoming.length}</span>}
            </button>
          ))}
          <button type="button" class="btn btn-primary btn-small" disabled={ready !== 'ok'} onClick={() => setWriting({})}>
            <Icon name="pen" size={16} /> {ta('mail.write')}
          </button>
          <button type="button" class="btn btn-small" disabled={ready !== 'ok' || fr.friends.length === 0} onClick={() => setWriting({ letter: template('heart') })}>{ta('mail.sendHeart')}</button>
          <button type="button" class="btn btn-small" disabled={ready !== 'ok' || fr.friends.length === 0} onClick={() => setWriting({ letter: template('flower') })}>{ta('mail.sendFlower')}</button>
        </div>

        {tab === 'inbox' && (
          <ul class="mail-list" aria-label={ta('mail.tab.inbox')}>
            {mail.length === 0 && ready === 'ok' && <li class="muted">{ta('mail.emptyInbox')}</li>}
            {mail.map((m) => (
              <li key={m.id}>
                <button type="button" class={`mail-row${m.unread ? ' unread' : ''}`} onClick={() => void open1(m.id)}>
                  <Icon name="mail" size={18} />
                  <span class="mail-main">
                    <strong>{m.fromTitle || m.from}</strong>
                    <span class="muted small">{m.summary || ta('mail.noSummary')}</span>
                  </span>
                  {m.unread && <span class="badge-count">{ta('mail.new')}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab === 'friends' && (
          <div class="friends">
            <form
              class="choice-row"
              onSubmit={async (e) => {
                e.preventDefault()
                const to = who.trim().replace(/^@/, '').toLowerCase()
                if (!to) return
                if (await guard(() => requestFriend(slug, server, to))) {
                  setNote(ta('mail.requested'))
                  setWho('')
                }
              }}
            >
              <input class="input" value={who} placeholder={ta('mail.friendPlaceholder')} aria-label={ta('mail.friendPlaceholder')} onInput={(e) => setWho((e.currentTarget as HTMLInputElement).value)} />
              <button type="submit" class="btn" disabled={ready !== 'ok'}>{ta('mail.addFriend')}</button>
            </form>
            {note && <p class="muted small" role="status">{note}</p>}
            {fr.incoming.map((p) => (
              <div class="mail-row" key={`in-${p.slug}`}>
                <span class="mail-main"><strong>{p.title || p.slug}</strong> <span class="muted small">@{p.slug} {ta('mail.wantsFriend')}</span></span>
                <button type="button" class="btn btn-small btn-primary" onClick={() => void guard(() => answerFriend(slug, server, p.slug, true), ta('mail.nowFriends'))}>{ta('mail.accept')}</button>
                <button type="button" class="btn btn-small" onClick={() => void guard(() => answerFriend(slug, server, p.slug, false))}>{ta('mail.decline')}</button>
              </div>
            ))}
            {fr.outgoing.map((p) => (
              <div class="mail-row" key={`out-${p.slug}`}><span class="mail-main"><strong>{p.title || p.slug}</strong> <span class="muted small">@{p.slug} · {ta('mail.waiting')}</span></span></div>
            ))}
            {fr.friends.length === 0 && fr.incoming.length === 0 && <p class="muted">{ta('mail.noFriends')}</p>}
            {fr.friends.map((p) => (
              <div class="mail-row" key={p.slug}>
                <span class="mail-main"><strong>{p.title || p.slug}</strong> <span class="muted small">@{p.slug}</span></span>
                <button type="button" class="btn btn-small" onClick={() => setWriting({ to: p.slug })}>{ta('mail.writeTo')}</button>
                <button type="button" class="btn btn-small" onClick={() => window.confirm(ta('mail.removeConfirm', { who: p.title || p.slug })) && void guard(() => removeFriend(slug, server, p.slug))}>{ta('mail.remove')}</button>
                <button type="button" class="btn btn-small" onClick={() => window.confirm(ta('mail.blockConfirm', { who: p.title || p.slug })) && void guard(() => blockPerson(slug, server, p.slug), ta('mail.blocked'))}>{ta('mail.block')}</button>
              </div>
            ))}
            {fr.blocked.length > 0 && (
              <>
                <h3>{ta('mail.blockedTitle')}</h3>
                {fr.blocked.map((b) => (
                  <div class="mail-row" key={b}>
                    <span class="mail-main">@{b}</span>
                    <button type="button" class="btn btn-small" onClick={() => void guard(() => unblockPerson(slug, server, b))}>{ta('mail.unblock')}</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'sent' && (
          <div>
            {outbox.length > 0 && (
              <ul class="mail-list" aria-label={ta('mail.outbox')}>
                {outbox.map((p) => (
                  <li key={p.clientId} class="mail-row">
                    <span class="mail-main"><strong>{ta('mail.notDelivered', { to: p.to })}</strong><span class="muted small">{p.summary} · {p.error ?? ta('mail.queued')}</span></span>
                    <button
                      type="button"
                      class="btn btn-small"
                      onClick={async () => {
                        const r = await sendQueued(slug, server, p)
                        ctx.toast(r.ok ? ta('mail.nowDelivered') : r.error, r.ok ? 'ok' : 'error')
                        void refresh()
                      }}
                    >
                      {ta('let.retry')}
                    </button>
                    <button type="button" class="btn btn-small" onClick={async () => (await saveOutbox((await loadOutbox()).filter((x) => x.clientId !== p.clientId)), setOutbox(await loadOutbox()))}>{ta('mail.discard')}</button>
                  </li>
                ))}
              </ul>
            )}
            <ul class="mail-list" aria-label={ta('mail.tab.sent')}>
              {sentList.length === 0 && outbox.length === 0 && <li class="muted">{ta('mail.emptySent')}</li>}
              {sentList.map((s) => (
                <li key={s.id} class="mail-row">
                  <span class="mail-main"><strong>{s.toTitle || s.to}</strong><span class="muted small">{s.summary}</span></span>
                  <span class="muted small">{s.state === 'read' ? ta('mail.read') : ta('mail.delivered')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  )
}
