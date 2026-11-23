import type { Project } from './schema.ts'

/**
 * The only view of a Project that may be published or exported.
 * Drops private posts, blocks that show them, images no public item uses, and private recordings.
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
  return { ...p, posts, blocks, assets, recordings }
}
