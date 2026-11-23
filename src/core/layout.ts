export const GRID_COLUMNS = 4

/** Allowed block sizes as [width, height]. */
export const SIZE_PRESETS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 1],
  [2, 2],
  [4, 1],
  [4, 2],
]

export type LayoutItem = { id: string; x: number; y: number; w: number; h: number }

export function isPreset(w: number, h: number): boolean {
  return SIZE_PRESETS.some(([pw, ph]) => pw === w && ph === h)
}

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function inBounds(b: LayoutItem): boolean {
  return (
    Number.isInteger(b.x) &&
    Number.isInteger(b.y) &&
    b.x >= 0 &&
    b.y >= 0 &&
    b.x + b.w <= GRID_COLUMNS
  )
}

export function isValidLayout(items: readonly LayoutItem[]): boolean {
  for (let i = 0; i < items.length; i++) {
    const a = items[i]!
    if (!inBounds(a) || !isPreset(a.w, a.h)) return false
    for (let j = i + 1; j < items.length; j++) {
      if (overlaps(a, items[j]!)) return false
    }
  }
  return true
}

/**
 * Puts `anchor` where it is and pushes every other block down until nothing overlaps.
 * Blocks are processed top-to-bottom so the result is stable and always valid.
 */
function settle<T extends LayoutItem>(anchor: T, others: readonly T[]): T[] {
  const fixed: T[] = [anchor]
  const queue = [...others].sort((a, b) => a.y - b.y || a.x - b.x || cmp(a.id, b.id))
  for (const original of queue) {
    const b = { ...original }
    for (;;) {
      const hits = fixed.filter((f) => overlaps(f, b))
      if (hits.length === 0) break
      b.y = Math.max(...hits.map((f) => f.y + f.h))
    }
    fixed.push(b)
  }
  return fixed
}

function clampToGrid<T extends LayoutItem>(b: T): T {
  const x = Math.min(Math.max(0, Math.trunc(b.x)), GRID_COLUMNS - b.w)
  const y = Math.max(0, Math.trunc(b.y))
  return { ...b, x, y }
}

function assertPreset(w: number, h: number): void {
  if (!isPreset(w, h)) throw new RangeError(`size ${w}x${h} is not a preset`)
}

/** Adds a new block (or replaces one with the same id) at its position. */
export function placeBlock<T extends LayoutItem>(layout: readonly T[], block: T): T[] {
  assertPreset(block.w, block.h)
  const anchor = clampToGrid(block)
  return settle(anchor, layout.filter((b) => b.id !== block.id))
}

export function moveBlock<T extends LayoutItem>(
  layout: readonly T[],
  id: string,
  x: number,
  y: number,
): T[] {
  const target = layout.find((b) => b.id === id)
  if (!target) return [...layout]
  return placeBlock(layout, { ...target, x, y })
}

export function resizeBlock<T extends LayoutItem>(
  layout: readonly T[],
  id: string,
  w: number,
  h: number,
): T[] {
  const target = layout.find((b) => b.id === id)
  if (!target) return [...layout]
  return placeBlock(layout, { ...target, w, h })
}

export function removeBlock<T extends LayoutItem>(layout: readonly T[], id: string): T[] {
  return layout.filter((b) => b.id !== id)
}

/** First free top-left position for a block of the given size, scanning rows. */
export function firstFreeSpot(layout: readonly LayoutItem[], w: number, h: number) {
  assertPreset(w, h)
  for (let y = 0; ; y++) {
    for (let x = 0; x + w <= GRID_COLUMNS; x++) {
      const probe = { id: '', x, y, w, h }
      if (!layout.some((b) => overlaps(b, probe))) return { x, y }
    }
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
