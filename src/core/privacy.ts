import { designAssetRefs, publicDesign } from './design.ts'
import type { Project } from './schema.ts'

export type DesignChoice = 'published' | 'draft'

/** The design a site is built from: the published snapshot, unless the owner previews the draft. */
export function chosenDesign(p: Project, which: DesignChoice = 'published') {
  return which === 'published' && p.web.published ? p.web.published.design : p.web.draft
}

/**
 * The only view of a Project that may be published or exported (an explicit allow-list).
 * Keeps public posts, public recordings, memory objects whose entry is public, and exactly ONE
 * website design (published snapshot by default) with hidden widgets and private references removed.
 * Images survive only when a public post uses them, the kept design shows them, or they are a
 * friend's badge. The draft design is never included when the published one is used.
 */
export function publicProjection(p: Project, which: DesignChoice = 'published'): Project {
  const posts = p.posts.filter((post) => post.visibility === 'public' && (post.kind !== 'gift' || p.gifts.some((g) => g.postId === post.id && g.shareable)))
  const publicPostIds = new Set(posts.map((post) => post.id))
  const design = publicDesign(chosenDesign(p, which), { publicPostIds })

  const usedAssets = new Set<string>()
  for (const post of posts) post.imageIds.forEach((id) => usedAssets.add(id))
  for (const id of designAssetRefs(design)) usedAssets.add(id)
  for (const l of p.links) if (l.buttonAssetId) usedAssets.add(l.buttonAssetId)
  const assets = p.assets.filter((a) => usedAssets.has(a.id))

  // A gift is public only when its record is public AND the sender allowed sharing. Both must hold.
  const gifts = p.gifts.filter((g) => g.shareable && publicPostIds.has(g.postId))
  const shareableIds = new Set(gifts.map((g) => g.postId))
  const recordings = p.recordings.filter((r) => r.visibility === 'public')
  // Skin and decor carry no personal text and stay. Memory objects follow their post.
  const publicRecordingIds = new Set(recordings.map((r) => r.id))
  const { welcomeRecordingId, ...roomRest } = p.room
  const room = {
    ...roomRest,
    memory: p.room.memory.filter((m) => publicPostIds.has(m.postId)),
    ...(welcomeRecordingId !== undefined && publicRecordingIds.has(welcomeRecordingId)
      ? { welcomeRecordingId }
      : {}),
  }
  const at = p.web.published?.at
  const web = {
    draft: design,
    ...(at ? { published: { design, at } } : {}),
    guestbook: p.web.guestbook,
  }
  void shareableIds
  const {privateHome: _privateHome,...publicFields}=p
  return { ...publicFields, posts, gifts, assets, recordings, room, web }
}
