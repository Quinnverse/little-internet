import { z } from 'zod'

/**
 * The home: one room on a 6×6 floor. Built-in furniture (desk with diary and computer, answering
 * machine table, shelf, pet bed, door, window) is fixed. The owner changes the skin, places decor
 * on free floor cells, and chooses which named slot each memory object sits in.
 * Pure data and rules; no DOM, no 3D.
 */

export const FLOOR_SIZE = 6

export const HOUSES = ['cabin', 'villa'] as const
export const WALLS = ['cream', 'sage', 'blush', 'sky', 'plum'] as const
export const FLOORS = ['oak', 'walnut', 'tile', 'checker'] as const
export const LIGHTS = ['auto', 'day', 'night'] as const

export const DECOR_KINDS = ['plant', 'cactus', 'floorlamp', 'armchair', 'stool', 'basket', 'bookcase', 'sidetable', 'lavalamp', 'officechair'] as const
export const MEMORY_KINDS = [
  'shell',
  'candle',
  'book',
  'flower',
  'cassette',
  'postcard',
  'photo',
  'ticket',
] as const

export type House = (typeof HOUSES)[number]
export type WallId = (typeof WALLS)[number]
export type FloorId = (typeof FLOORS)[number]
export type LightMode = (typeof LIGHTS)[number]
export type DecorKind = (typeof DECOR_KINDS)[number]
export type MemoryKind = (typeof MEMORY_KINDS)[number]

export const MAX_DECOR = 12
export const MAX_MEMORY_OBJECTS = 40

type SlotGroup = 'shelf' | 'desk' | 'sill' | 'wall'

export const SLOT_GROUPS: Record<SlotGroup, readonly string[]> = {
  shelf: ['shelf-1', 'shelf-2', 'shelf-3', 'shelf-4', 'shelf-5', 'shelf-6'],
  desk: ['desk-1', 'desk-2', 'desk-3'],
  sill: ['sill-1', 'sill-2'],
  wall: ['wall-1', 'wall-2', 'wall-3', 'wall-4'],
}

export const SLOTS: readonly string[] = [
  ...SLOT_GROUPS.shelf,
  ...SLOT_GROUPS.desk,
  ...SLOT_GROUPS.sill,
  ...SLOT_GROUPS.wall,
]

/** Which slot groups each memory kind may use, in order of preference. */
export const KIND_GROUPS: Record<MemoryKind, readonly SlotGroup[]> = {
  shell: ['shelf', 'sill', 'desk'],
  candle: ['desk', 'shelf', 'sill'],
  book: ['shelf', 'desk'],
  flower: ['sill', 'desk', 'shelf'],
  cassette: ['shelf', 'desk'],
  postcard: ['wall'],
  photo: ['wall', 'desk', 'shelf'],
  ticket: ['wall'],
}

/** Cells taken by built-in furniture (x to the right, z toward the viewer). */
export const RESERVED_CELLS: readonly (readonly [number, number])[] = [
  [0, 0], [1, 0], // desk
  [1, 1], // chair
  [2, 0], [3, 0], // dresser under the window
  [4, 0], [5, 0], // shelf
  [0, 2], // answering machine table
  [4, 3], // pet bed
  [1, 4], // entrance
]

const ID = /^[a-z0-9_-]{1,40}$/
const id = z.string().regex(ID)
const cell = z.number().int().min(0).max(FLOOR_SIZE - 1)

export const DecorItemSchema = z.object({
  id,
  kind: z.enum(DECOR_KINDS),
  x: cell,
  z: cell,
  rot: z.number().int().min(0).max(3),
})

export const MemoryObjectSchema = z.object({
  id,
  kind: z.enum(MEMORY_KINDS),
  postId: id,
  slot: z.string().refine((s) => SLOTS.includes(s), 'unknown slot'),
})

export type DecorItem = z.infer<typeof DecorItemSchema>
export type MemoryObject = z.infer<typeof MemoryObjectSchema>

export function defaultRoom(): Room {
  return {
    house: 'cabin',
    wall: 'cream',
    floor: 'oak',
    light: 'auto',
    decor: [
      { id: 'plant-1', kind: 'plant', x: 5, z: 1, rot: 0 },
      { id: 'lamp-1', kind: 'floorlamp', x: 2, z: 1, rot: 0 },
      { id: 'chair-1', kind: 'armchair', x: 3, z: 4, rot: 1 },
    ],
    memory: [],
  }
}

export const RoomSchema = z.object({
  house: z.enum(HOUSES),
  wall: z.enum(WALLS),
  floor: z.enum(FLOORS),
  light: z.enum(LIGHTS),
  decor: z.array(DecorItemSchema).max(MAX_DECOR),
  memory: z.array(MemoryObjectSchema).max(MAX_MEMORY_OBJECTS),
  welcomeRecordingId: id.optional(),
})

export type Room = z.infer<typeof RoomSchema>

const key = (x: number, zz: number) => `${x},${zz}`
const RESERVED = new Set(RESERVED_CELLS.map(([x, zz]) => key(x, zz)))

export function isReservedCell(x: number, zz: number): boolean {
  return RESERVED.has(key(x, zz))
}

/** Structural problems in a room (bounds are already enforced by the schema). */
export function roomIssues(room: Room): string[] {
  const issues: string[] = []
  const seenCells = new Set<string>()
  const ids = new Set<string>()
  for (const d of room.decor) {
    if (ids.has(d.id)) issues.push(`duplicate decor id ${d.id}`)
    ids.add(d.id)
    const k = key(d.x, d.z)
    if (RESERVED.has(k)) issues.push(`decor ${d.id} is on built-in furniture`)
    if (seenCells.has(k)) issues.push(`decor ${d.id} overlaps another item`)
    seenCells.add(k)
  }
  const slots = new Set<string>()
  const memIds = new Set<string>()
  for (const m of room.memory) {
    if (memIds.has(m.id)) issues.push(`duplicate memory object id ${m.id}`)
    memIds.add(m.id)
    if (slots.has(m.slot)) issues.push(`slot ${m.slot} holds two objects`)
    slots.add(m.slot)
    if (!slotAllowed(m.kind, m.slot)) issues.push(`${m.kind} cannot sit in ${m.slot}`)
  }
  return issues
}

export function slotGroup(slot: string): SlotGroup | undefined {
  return (Object.keys(SLOT_GROUPS) as SlotGroup[]).find((g) => SLOT_GROUPS[g].includes(slot))
}

export function slotAllowed(kind: MemoryKind, slot: string): boolean {
  const g = slotGroup(slot)
  return g !== undefined && KIND_GROUPS[kind].includes(g)
}

/** Slots a kind may use that are not taken (optionally ignoring one object, for moves). */
export function freeSlotsFor(room: Room, kind: MemoryKind, ignoreId?: string): string[] {
  const taken = new Set(room.memory.filter((m) => m.id !== ignoreId).map((m) => m.slot))
  const out: string[] = []
  for (const g of KIND_GROUPS[kind]) for (const s of SLOT_GROUPS[g]) if (!taken.has(s)) out.push(s)
  return out
}

/** How many keepsake spots (shelves, desk, sill, wall) are still empty. */
export function freeSlotsAll(room: Room): number {
  const taken = new Set(room.memory.map((m) => m.slot))
  return SLOTS.filter((x) => !taken.has(x)).length
}

export function autoSlot(room: Room, kind: MemoryKind): string | undefined {
  return freeSlotsFor(room, kind)[0]
}

/** First free floor cell, scanning from the front of the room, or undefined when full. */
export function firstFreeCell(room: Room): [number, number] | undefined {
  const taken = new Set(room.decor.map((d) => key(d.x, d.z)))
  for (let zz = FLOOR_SIZE - 1; zz >= 0; zz--) {
    for (let x = FLOOR_SIZE - 1; x >= 0; x--) {
      if (!RESERVED.has(key(x, zz)) && !taken.has(key(x, zz))) return [x, zz]
    }
  }
  return undefined
}

export function canPlaceDecor(room: Room, itemId: string | undefined, x: number, zz: number): string | null {
  if (x < 0 || zz < 0 || x >= FLOOR_SIZE || zz >= FLOOR_SIZE) return 'outside'
  if (RESERVED.has(key(x, zz))) return 'furniture'
  if (room.decor.some((d) => d.id !== itemId && d.x === x && d.z === zz)) return 'occupied'
  return null
}

/**
 * Saves made before the dresser existed may have decor on its cells. Moves such items to the first free
 * cell so the save still loads (only touches data that would otherwise be invalid).
 */
export function migrateRoomInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input
  const room = input as { decor?: unknown }
  if (!Array.isArray(room.decor)) return input
  const items = room.decor as { x?: unknown; z?: unknown }[]
  const bad = (d: { x?: unknown; z?: unknown }) => Number.isInteger(d.x) && Number.isInteger(d.z) && RESERVED.has(key(d.x as number, d.z as number))
  if (!items.some((d) => d && typeof d === 'object' && bad(d))) return input
  const taken = new Set(items.filter((d) => d && typeof d === 'object' && !bad(d)).map((d) => key(d.x as number, d.z as number)))
  const moved = items.map((d) => {
    if (!d || typeof d !== 'object' || !bad(d)) return d
    for (let zz = FLOOR_SIZE - 1; zz >= 0; zz--) {
      for (let x = FLOOR_SIZE - 1; x >= 0; x--) {
        if (!RESERVED.has(key(x, zz)) && !taken.has(key(x, zz))) {
          taken.add(key(x, zz))
          return { ...d, x, z: zz }
        }
      }
    }
    return d
  })
  return { ...(input as object), decor: moved }
}

/** Canonical ordering so exports are deterministic. */
export function normalizeRoom(room: Room): Room {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return {
    ...room,
    decor: [...room.decor].sort((a, b) => cmp(a.id, b.id)),
    memory: [...room.memory].sort((a, b) => cmp(a.id, b.id)),
  }
}
