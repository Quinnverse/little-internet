import { normalizeDesign } from './design.ts'
import { normalizeRoom } from './room.ts'
import type { Project } from './schema.ts'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Canonical form of a Project. Ordering of posts, widgets and assets carries no meaning,
 * so they are sorted; friend links keep the creator's order.
 */
export function normalize(p: Project): Project {
  return {
    ...p,
    posts: [...p.posts].sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id)),
    web: {
      ...p.web,
      draft: normalizeDesign(p.web.draft),
      ...(p.web.published ? { published: { ...p.web.published, design: normalizeDesign(p.web.published.design) } } : {}),
    },
    assets: [...p.assets].sort((a, b) => cmp(a.id, b.id)),
    links: [...p.links],
    gifts: [...p.gifts].sort((a, b) => cmp(a.id, b.id)),
    room: normalizeRoom(p.room),
    recordings: [...p.recordings].sort((a, b) => cmp(b.createdAt, a.createdAt) || cmp(a.id, b.id)),
  }
}
