import { useState } from 'preact/hooks'
import { DECOR_KINDS, FLOORS, HOUSES, LIGHTS, MAX_DECOR, WALLS, freeSlotsFor } from '../../core/room.ts'
import { FLOOR_SWATCH, WALL_SWATCH } from '../../room3d/materials.ts'
import {
  addDecor,
  moveMemoryObject,
  removeDecor,
  rotateDecor,
  setPostObject,
  updateRoomSkin,
  type Command,
} from '../commands.ts'
import { randomId } from '../ids.ts'
import { t, useLang, type Key } from '../i18n.ts'
import type { Ctx } from './common.tsx'
import { Icon, type IconName } from './icons.tsx'

type Tab = 'style' | 'things'

/** A docked panel (not a modal) so the room stays visible and tappable while decorating. */
export function Decorate(props: {
  ctx: Ctx
  apply: (cmd: Command) => boolean
  undo: () => void
  undoable: number
  selected: string | null
  setSelected: (id: string | null) => void
  onDone: () => void
}) {
  useLang()
  const { ctx, apply, selected } = props
  const room = ctx.project.room
  const [tab, setTab] = useState<Tab>('style')
  const sel = selected?.startsWith('decor:')
    ? { type: 'decor' as const, id: selected.slice(6) }
    : selected?.startsWith('memory:')
      ? { type: 'memory' as const, id: selected.slice(7) }
      : null
  const selDecor = sel?.type === 'decor' ? room.decor.find((d) => d.id === sel.id) : undefined
  const selMemory = sel?.type === 'memory' ? room.memory.find((m) => m.id === sel.id) : undefined

  const add = (kind: (typeof DECOR_KINDS)[number]) => {
    if (room.decor.length >= MAX_DECOR) return ctx.toast(t('deco.full'), 'error')
    const id = randomId()
    if (apply(addDecor(id, kind))) props.setSelected(`decor:${id}`)
  }

  const nextSlot = () => {
    if (!selMemory) return
    const free = freeSlotsFor(room, selMemory.kind, selMemory.id)
    if (!free.length) return
    const i = free.indexOf(selMemory.slot)
    apply(moveMemoryObject(selMemory.id, free[(i + 1) % free.length]!))
  }

  return (
    <section class="deco" aria-label={t('deco.title')}>
      <div class="deco-head">
        <div class="seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'style'} class={tab === 'style' ? 'on' : ''} onClick={() => setTab('style')}>
            {t('deco.style')}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'things'} class={tab === 'things' ? 'on' : ''} onClick={() => setTab('things')}>
            {t('deco.things')}
          </button>
        </div>
        <button type="button" class="round small" onClick={props.undo} disabled={!props.undoable} aria-label={t('common.undo')} title={t('common.undo')}>
          <Icon name="undo" size={18} />
        </button>
        <button type="button" class="btn btn-primary btn-small" onClick={props.onDone}>
          <Icon name="check" size={16} /> {t('common.done')}
        </button>
      </div>

      {tab === 'style' && (
        <div class="deco-body">
          <div class="deco-row">
            <span class="deco-label">{t('deco.house')}</span>
            <div class="choice-row">
              {HOUSES.map((h) => (
                <button type="button" key={h} class={`chip ${room.house === h ? 'selected' : ''}`} aria-pressed={room.house === h} onClick={() => apply(updateRoomSkin({ house: h }))}>
                  {t(`house.${h}` as Key)}
                </button>
              ))}
            </div>
          </div>
          <div class="deco-row">
            <span class="deco-label">{t('deco.wall')}</span>
            <div class="choice-row">
              {WALLS.map((w) => (
                <button
                  type="button"
                  key={w}
                  class={`swatch ${room.wall === w ? 'selected' : ''}`}
                  style={{ background: WALL_SWATCH[w] }}
                  aria-label={t(`wall.${w}` as Key)}
                  aria-pressed={room.wall === w}
                  title={t(`wall.${w}` as Key)}
                  onClick={() => apply(updateRoomSkin({ wall: w }))}
                />
              ))}
            </div>
          </div>
          <div class="deco-row">
            <span class="deco-label">{t('deco.floor')}</span>
            <div class="choice-row">
              {FLOORS.map((f) => (
                <button
                  type="button"
                  key={f}
                  class={`swatch ${room.floor === f ? 'selected' : ''}`}
                  style={{ background: FLOOR_SWATCH[f] }}
                  aria-label={t(`floor.${f}` as Key)}
                  aria-pressed={room.floor === f}
                  title={t(`floor.${f}` as Key)}
                  onClick={() => apply(updateRoomSkin({ floor: f }))}
                />
              ))}
            </div>
          </div>
          <div class="deco-row">
            <span class="deco-label">{t('deco.light')}</span>
            <div class="choice-row">
              {LIGHTS.map((l) => (
                <button type="button" key={l} class={`chip ${room.light === l ? 'selected' : ''}`} aria-pressed={room.light === l} onClick={() => apply(updateRoomSkin({ light: l }))}>
                  {t(`light.${l}` as Key)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'things' && (
        <div class="deco-body">
          <div class="kind-row">
            {DECOR_KINDS.map((k) => (
              <button type="button" key={k} class="kind-btn" onClick={() => add(k)} aria-label={t('deco.add', { kind: t(`kind.${k}` as Key) })}>
                <Icon name={KIND_ICON[k]} size={22} />
                <span>{t(`kind.${k}` as Key)}</span>
              </button>
            ))}
          </div>
          {!sel && <p class="muted small">{t('deco.selectHint')}</p>}
          {selDecor && (
            <div class="deco-sel">
              <strong>{t(`kind.${selDecor.kind}` as Key)}</strong>
              <p class="muted small">{t('deco.tapFloor')}</p>
              <div class="choice-row">
                <button type="button" class="btn btn-small" onClick={() => apply(rotateDecor(selDecor.id))}>
                  <Icon name="rotate" size={16} /> {t('deco.rotate')}
                </button>
                <button
                  type="button"
                  class="btn btn-small btn-danger"
                  onClick={() => {
                    if (apply(removeDecor(selDecor.id))) props.setSelected(null)
                  }}
                >
                  <Icon name="trash" size={16} /> {t('deco.remove')}
                </button>
              </div>
            </div>
          )}
          {selMemory && (
            <div class="deco-sel">
              <strong>{t('deco.keepsake', { title: ctx.project.posts.find((p) => p.id === selMemory.postId)?.title || t(`kind.${selMemory.kind}` as Key) })}</strong>
              <div class="choice-row">
                <button type="button" class="btn btn-small" onClick={nextSlot}>
                  <Icon name="move" size={16} /> {t('deco.moveSpot')}
                </button>
                <button
                  type="button"
                  class="btn btn-small btn-danger"
                  onClick={() => {
                    if (apply(setPostObject(selMemory.postId, null, randomId()))) props.setSelected(null)
                  }}
                >
                  {t('deco.takeDown')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export const KIND_ICON: Record<string, IconName> = {
  plant: 'plant',
  cactus: 'cactus',
  floorlamp: 'lamp',
  armchair: 'sofa',
  stool: 'stool',
  basket: 'basket',
  bookcase: 'book',
  shell: 'shell',
  candle: 'candle',
  book: 'book',
  flower: 'flower',
  cassette: 'cassette',
  postcard: 'postcard',
  photo: 'photo',
  ticket: 'ticket',
}
