import { assetPath, recordingPath, type Project } from './schema.ts'
import { siteStrings } from './strings.ts'

/**
 * What the visitor's 3D room needs, derived ONLY from the public projection. It is embedded in
 * index.html as JSON and read by room.js. Nothing here may come from a private entry.
 */
export function roomData(pub: Project) {
  const S = siteStrings(pub.site.lang)
  const posts = new Map(pub.posts.map((p) => [p.id, p]))
  const welcomeRec = pub.room.welcomeRecordingId
    ? pub.recordings.find((r) => r.id === pub.room.welcomeRecordingId)
    : undefined

  const memory = pub.room.memory.flatMap((m) => {
    const post = posts.get(m.postId)
    if (!post) return []
    const cover = post.imageIds[0] ? pub.assets.find((a) => a.id === post.imageIds[0]) : undefined
    return [
      {
        id: m.id,
        kind: m.kind,
        slot: m.slot,
        title: post.title || post.createdAt.slice(0, 10),
        href: `posts/${post.slug}.html`,
        ...(cover ? { thumb: assetPath(cover.id, cover.mime) } : {}),
      },
    ]
  })

  return {
    v: 1,
    slug: pub.site.slug,
    lang: pub.site.lang,
    title: pub.site.title,
    tagline: pub.site.tagline,
    house: pub.room.house,
    wall: pub.room.wall,
    floor: pub.room.floor,
    light: pub.room.light,
    decor: pub.room.decor.map(({ kind, x, z, rot }) => ({ kind, x, z, rot })),
    memory,
    entries: pub.posts.slice(0, 40).map((p) => ({ title: p.title || p.createdAt.slice(0, 10), href: `posts/${p.slug}.html`, date: p.createdAt.slice(0, 10) })),
    ...(welcomeRec
      ? {
          welcome: {
            src: recordingPath(welcomeRec.id, welcomeRec.mime),
            title: welcomeRec.title,
            durationMs: welcomeRec.durationMs,
            createdAt: welcomeRec.createdAt.slice(0, 10),
          },
        }
      : {}),
    pet: { enabled: pub.ghost.enabled, name: pub.ghost.name, color: pub.ghost.color },
    t: S,
  }
}

export type RoomData = ReturnType<typeof roomData>
