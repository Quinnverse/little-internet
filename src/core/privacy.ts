import type { Project } from './schema.ts'

/**
 * The only view of a Project that may be published or exported.
 * Drops private posts, blocks and memory objects that show them, images no public item uses,
 * private recordings, and a welcome message that is not public.
 */
export function publicProjection(p: Project): Project {
  const posts = p.posts.filter((post) => post.visibility === 'public')
  const publicPostIds = new Set(posts.map((post) => post.id))
  const blocks = p.blocks.filter(
    (b) => b.content.kind !== 'post' || publicPostIds.has(b.content.postId),
  )
  const usedAssets = new Set<string>()
  for (const post of posts) post.imageIds.forEach((id) => usedAssets.add(id))
  for (const b of blocks) if (b.content.kind === 'image') usedAssets.add(b.content.assetId)
  const assets = p.assets.filter((a) => usedAssets.has(a.id))
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
  return { ...p, posts, blocks, assets, recordings, room }
}
