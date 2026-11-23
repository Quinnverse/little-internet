import { normalizeRoom } from './room.ts'
import type { Project } from './schema.ts'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Canonical form of a Project. Ordering of posts, blocks and assets carries no meaning,
 * so they are sorted; friend links keep the creator's order.
 */
export function normalize(p: Project): Project {
  return {
    ...p,
    posts: [...p.posts].sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id)),
    blocks: [...p.blocks].sort((a, b) => a.y - b.y || a.x - b.x || cmp(a.id, b.id)),
    assets: [...p.assets].sort((a, b) => cmp(a.id, b.id)),
    links: [...p.links],
    room: normalizeRoom(p.room),
    recordings: [...p.recordings].sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id)),
  }
}
