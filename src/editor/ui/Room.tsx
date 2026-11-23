import { useState } from 'preact/hooks'
import type { Block, BlockContent, Post } from '../../core/schema.ts'
import {
  addAsset,
  addBlock,
  compose,
  deleteBlock,
  moveBlockTo,
  resizeBlockTo,
  setBlockText,
  type BlockSize,
} from '../commands.ts'
import { THEME_VARS } from '../../core/themes.ts'
import { pickFiles } from '../download.ts'
import { randomId } from '../ids.ts'
import { processPhoto } from '../images.ts'
import { assetUrl, Field, formatDate, GhostIcon, Lock, run, Sheet, type Ctx } from './common.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { OwnerGhost } from './OwnerGhost.tsx'
import { VoiceSheet } from './VoiceSheet.tsx'
import { Icon } from './icons.tsx'

const SIZES: Array<BlockSize & { label: string }> = [
  { w: 1, h: 1, label: 'Small square' },
  { w: 2, h: 1, label: 'Wide' },
  { w: 2, h: 2, label: 'Big square' },
  { w: 4, h: 1, label: 'Full-width strip' },
  { w: 4, h: 2, label: 'Full-width large' },
]

const KIND_LABEL: Record<BlockContent['kind'], string> = {
  post: 'Diary entry',
  image: 'Photo frame',
  text: 'Note',
  latest: 'Latest entries',
  links: 'Friends shelf',
  'ghost-home': 'Ghost’s spot',
  voice: 'Answering machine',
}

type Sheets = null | 'add' | 'pick-entry' | 'size' | 'ghost' | 'voice' | { note: Block } | { entry: Post }

export function Room(props: { ctx: Ctx }) {
  const { ctx } = props
  const { project } = ctx
  const [selected, setSelected] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [sheet, setSheet] = useState<Sheets>(null)
  const [noteText, setNoteText] = useState('')

  const sel = project.blocks.find((b) => b.id === selected) ?? null
  const rows = Math.max(4, ...project.blocks.map((b) => b.y + b.h)) + (moving ? 2 : 1)

  const add = (content: BlockContent, size: BlockSize, extra?: Parameters<typeof compose>[number]) => {
    const id = randomId()
    const ok = run(ctx, extra ? compose(extra, addBlock(id, content, size)) : addBlock(id, content, size))
    if (ok) {
      setSelected(id)
      setSheet(null)
    }
  }

  const addPhoto = async () => {
    const [file] = await pickFiles('image/*')
    if (!file) return
    try {
      const img = await processPhoto(file)
      const asset = { id: randomId(), ...img }
      add({ kind: 'image', assetId: asset.id }, { w: 2, h: 2 }, addAsset(asset))
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const tapCell = (x: number, y: number) => {
    if (moving && sel) {
      run(ctx, moveBlockTo(sel.id, Math.min(x, 4 - sel.w), y))
      setMoving(false)
    } else {
      setSelected(null)
    }
  }

  const editSelected = () => {
    if (!sel) return
    if (sel.content.kind === 'text') {
      setNoteText(sel.content.text)
      setSheet({ note: sel })
    } else if (sel.content.kind === 'voice') {
      setSheet('voice')
    } else if (sel.content.kind === 'post') {
      const postId = sel.content.postId
      const post = project.posts.find((p) => p.id === postId)
      if (post) setSheet({ entry: post })
    }
  }

  const cells = []
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < 4; x++)
      cells.push(
        <button
          type="button"
          key={`c${x}-${y}`}
          class={`cell ${moving ? 'cell-target' : ''}`}
          style={{ gridColumn: `${x + 1}`, gridRow: `${y + 1}` }}
          aria-label={moving ? `Move here: column ${x + 1}, row ${y + 1}` : 'Empty space'}
          tabIndex={moving ? 0 : -1}
          onClick={() => tapCell(x, y)}
        />,
      )

  return (
    <section
      class="screen room"
      style={{
        '--room-bg': THEME_VARS[project.site.theme].bg,
        '--room-fg': THEME_VARS[project.site.theme].fg,
        '--room-muted': THEME_VARS[project.site.theme].muted,
        '--room-card': THEME_VARS[project.site.theme].card,
        '--room-border': THEME_VARS[project.site.theme].border,
        fontFamily: THEME_VARS[project.site.theme].font,
      }}
    >
      <div class="screen-head">
        <h1>Room</h1>
        <span class="head-actions">
        <button type="button" class="btn" onClick={() => setSheet('ghost')} aria-label={`Talk to ${project.ghost.name || 'your ghost'}`}>
          <GhostIcon color={project.ghost.color} size={22} /> {project.ghost.name || 'Ghost'}
        </button>
        <button type="button" class="btn btn-primary" onClick={() => setSheet('add')}>
          <Icon name="plus" size={18} /> Add
        </button>
        </span>
      </div>
      {moving && <p class="hint-bar">Tap where the top-left corner should go.</p>}

      <div class="room-wrap">
        <div class={`room-grid ${moving ? 'is-moving' : ''}`} style={{ gridTemplateRows: `repeat(${rows}, var(--cell))` }}>
          {cells}
          {project.blocks.map((b) => (
            <button
              type="button"
              key={b.id}
              class={`tile tile-${b.content.kind} ${b.id === selected ? 'selected' : ''}`}
              style={{ gridColumn: `${b.x + 1} / span ${b.w}`, gridRow: `${b.y + 1} / span ${b.h}` }}
              aria-pressed={b.id === selected}
              aria-label={tileLabel(project, b)}
              onClick={() => {
                setMoving(false)
                setSelected(b.id === selected ? null : b.id)
              }}
            >
              <Tile ctx={ctx} block={b} />
            </button>
          ))}
        </div>
      </div>

      {sel && (
        <div class="block-toolbar" role="toolbar" aria-label={`${KIND_LABEL[sel.content.kind]} actions`}>
          {sel.content.kind === 'ghost-home' && (
            <button type="button" onClick={() => setSheet('ghost')}>
              <Icon name="ghost" /> Talk
            </button>
          )}
          <button type="button" class={moving ? 'selected' : ''} onClick={() => setMoving(!moving)}>
            <Icon name="move" /> Move
          </button>
          <button type="button" onClick={() => setSheet('size')}><Icon name="resize" /> Size</button>
          {(sel.content.kind === 'text' || sel.content.kind === 'post' || sel.content.kind === 'voice') && (
            <button type="button" onClick={editSelected}><Icon name="edit" /> Edit</button>
          )}
          <button
            type="button"
            onClick={() => {
              if (run(ctx, deleteBlock(sel.id))) setSelected(null)
            }}
          >
            <Icon name="trash" /> Remove
          </button>
        </div>
      )}

      {sheet === 'add' && (
        <Sheet title="Add to your room" onClose={() => setSheet(null)}>
          <div class="add-grid">
            <button type="button" onClick={() => setSheet('pick-entry')} disabled={project.posts.length === 0}>
              <Icon name="book" size={28} /><span>Diary entry</span>
            </button>
            <button type="button" onClick={addPhoto}><Icon name="photo" size={28} /><span>Photo frame</span></button>
            <button
              type="button"
              onClick={() => {
                setNoteText('')
                add({ kind: 'text', text: '' }, { w: 2, h: 1 })
              }}
            >
              <Icon name="note" size={28} /><span>Note</span>
            </button>
            <button type="button" onClick={() => add({ kind: 'latest' }, { w: 2, h: 2 })}><Icon name="list" size={28} /><span>Latest entries</span></button>
            <button type="button" onClick={() => add({ kind: 'links' }, { w: 2, h: 1 })}><Icon name="shelf" size={28} /><span>Friends shelf</span></button>
            <button type="button" onClick={() => add({ kind: 'ghost-home' }, { w: 1, h: 1 })}><Icon name="ghost" size={28} /><span>Ghost’s spot</span></button>
            <button
              type="button"
              onClick={() => {
                const id = randomId()
                if (run(ctx, addBlock(id, { kind: 'voice' }, { w: 4, h: 2 }))) {
                  setSelected(id)
                  setSheet('voice')
                }
              }}
            >
              <Icon name="phone" size={28} /><span>Answering machine</span>
            </button>
          </div>
          {project.posts.length === 0 && <p class="muted">Write a diary entry first to pin it here.</p>}
        </Sheet>
      )}

      {sheet === 'pick-entry' && (
        <Sheet title="Pin an entry" onClose={() => setSheet(null)}>
          <ul class="pick-list">
            {project.posts.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add({ kind: 'post', postId: p.id }, { w: 2, h: 2 })}>
                  <span>{p.title || formatDate(p.createdAt)}</span>
                  <Lock private={p.visibility === 'private'} />
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {sheet === 'size' && sel && (
        <Sheet title="Size" onClose={() => setSheet(null)}>
          <ul class="pick-list">
            {SIZES.map((s) => (
              <li key={`${s.w}x${s.h}`}>
                <button
                  type="button"
                  aria-pressed={sel.w === s.w && sel.h === s.h}
                  onClick={() => {
                    run(ctx, resizeBlockTo(sel.id, s))
                    setSheet(null)
                  }}
                >
                  <span class="size-icon" style={{ width: `${s.w * 12}px`, height: `${s.h * 12}px` }} />
                  <span>{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {sheet && typeof sheet === 'object' && 'note' in sheet && (
        <Sheet title="Note" onClose={() => setSheet(null)}>
          <Field label="Text" hint="Notes on your room are visible to visitors.">
            <textarea rows={5} maxLength={500} value={noteText} onInput={(e) => setNoteText(e.currentTarget.value)} />
          </Field>
          <div class="sheet-actions">
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => run(ctx, setBlockText(sheet.note.id, noteText)) && setSheet(null)}
            >
              Save
            </button>
          </div>
        </Sheet>
      )}

      {sheet === 'ghost' && <OwnerGhost ctx={ctx} onClose={() => setSheet(null)} />}
      {sheet === 'voice' && <VoiceSheet ctx={ctx} onClose={() => setSheet(null)} />}

      {sheet && typeof sheet === 'object' && 'entry' in sheet && (
        <EntrySheet ctx={ctx} post={sheet.entry} onClose={() => setSheet(null)} />
      )}
    </section>
  )
}

function tileLabel(project: Ctx['project'], b: Block): string {
  const c = b.content
  if (c.kind === 'post') {
    const post = project.posts.find((p) => p.id === c.postId)
    const title = post ? post.title || formatDate(post.createdAt) : ''
    return `${KIND_LABEL.post}: ${title}${post?.visibility === 'private' ? ' (hidden from visitors)' : ''}`
  }
  if (c.kind === 'text') return `${KIND_LABEL.text}: ${c.text.slice(0, 40)}`
  return KIND_LABEL[c.kind]
}

function Tile(props: { ctx: Ctx; block: Block }) {
  const { project } = props.ctx
  const c = props.block.content
  switch (c.kind) {
    case 'post': {
      const post = project.posts.find((p) => p.id === c.postId)
      if (!post) return null
      const cover = project.assets.find((a) => a.id === post.imageIds[0])
      return (
        <>
          {cover && <img src={assetUrl(cover)} alt="" class="tile-cover" />}
          <strong class="tile-title">{post.title || formatDate(post.createdAt)}</strong>
          {post.visibility === 'private' && <span class="tile-hidden"><Icon name="lock" size={12} /> Hidden from visitors</span>}
        </>
      )
    }
    case 'image': {
      const asset = project.assets.find((a) => a.id === c.assetId)
      return asset ? <img src={assetUrl(asset)} alt="" class="tile-photo" /> : null
    }
    case 'text':
      return <span class="tile-note">{c.text || 'Tap Edit to write a note'}</span>
    case 'latest': {
      const pub = project.posts.filter((p) => p.visibility === 'public').slice(0, 4)
      return (
        <>
          <strong class="tile-title">Latest</strong>
          <span class="tile-small muted">{pub.length ? pub.map((p) => p.title || formatDate(p.createdAt)).join(' · ') : 'Public entries appear here'}</span>
        </>
      )
    }
    case 'links':
      return (
        <>
          <strong class="tile-title">Friends</strong>
          <span class="tile-small muted">{project.links.length ? `${project.links.length} linked` : 'Add friends in Door'}</span>
        </>
      )
    case 'voice': {
      const total = project.recordings.length
      const pub = project.recordings.filter((r) => r.visibility === 'public').length
      return (
        <>
          <Icon name="phone" size={30} />
          <strong class="tile-title">Answering machine</strong>
          <span class="tile-small muted">
            {total === 0 ? 'Tap Edit to leave a message' : `${total} ${total === 1 ? 'message' : 'messages'} · ${pub} public`}
          </span>
        </>
      )
    }
    case 'ghost-home':
      return (
        <>
          <GhostIcon color={project.ghost.color} size={36} />
          <span class="tile-small">{project.ghost.enabled ? project.ghost.name : 'Ghost is off'}</span>
        </>
      )
  }
}
