import fc from 'fast-check'
import { placeBlock } from '../src/core/layout.ts'
import {
  GHOST_COLORS,
  IMAGE_MIMES,
  isCanonicalHttpUrl,
  isSafeLine,
  isSafeText,
  THEMES,
  type Asset,
  type Block,
  type BlockContent,
  type Link,
  type Post,
  type Project,
} from '../src/core/schema.ts'

/** Strings chosen to break naive escaping in HTML, attributes, XML, JSON-in-script and CSS. */
export const NASTY = [
  '<script>alert(1)</script>',
  '</script><script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  "' onmouseover='alert(1)",
  '<!--',
  '-->',
  ']]>',
  '&amp;',
  '&#x3C;',
  'javascript:alert(1)',
  '\u2028',
  '\u2029',
  '${x}',
  '}</style><style>',
  '😀',
  '中文',
  'é',
]

const piece = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(...NASTY) },
  { weight: 3, arbitrary: fc.string({ maxLength: 8 }) },
)

const pieceWithBreaks = fc.oneof(
  { weight: 4, arbitrary: piece },
  { weight: 1, arbitrary: fc.constantFrom('\n', '\n\n', '\r\n', '\t') },
)

export const lineArb = (max: number) =>
  fc
    .array(piece, { maxLength: 6 })
    .map((xs) => xs.join('').slice(0, max))
    .filter(isSafeLine)

export const textArb = (max: number) =>
  fc
    .array(pieceWithBreaks, { maxLength: 10 })
    .map((xs) => xs.join('').slice(0, max))
    .filter(isSafeText)

export const idArb = fc.stringMatching(/^[a-z0-9_-]{1,12}$/)
export const postSlugArb = fc.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,10}[a-z0-9])?$/)
export const siteSlugArb = fc.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,8}[a-z0-9])?$/)

export const urlArb = fc
  .webUrl({ withQueryParameters: true, withFragments: true })
  .map((u) => {
    try {
      return new URL(u).href
    } catch {
      return ''
    }
  })
  .filter(isCanonicalHttpUrl)

const isoArb = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString())

const videoArb = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9_-]{11}$/).map((videoId) => ({ provider: 'youtube' as const, videoId })),
  fc.stringMatching(/^[0-9]{1,9}$/).map((videoId) => ({ provider: 'vimeo' as const, videoId })),
)

const assetArb: fc.Arbitrary<Asset> = fc.record({
  id: idArb,
  mime: fc.constantFrom(...IMAGE_MIMES),
  data: fc.uint8Array({ minLength: 1, maxLength: 32 }),
})

type PostBase = Omit<Post, 'imageIds'>

const postBaseArb: fc.Arbitrary<PostBase> = fc.record(
  {
    id: idArb,
    slug: postSlugArb,
    title: lineArb(120),
    body: textArb(2000),
    createdAt: isoArb,
    visibility: fc.constantFrom('public' as const, 'private' as const),
    video: videoArb,
  },
  { requiredKeys: ['id', 'slug', 'title', 'body', 'createdAt', 'visibility'] },
)

const linkArb: fc.Arbitrary<Link> = fc.record({ id: idArb, title: lineArb(80), url: urlArb })

const sizeArb = fc.constantFrom<[1 | 2 | 4, 1 | 2]>([1, 1], [2, 1], [2, 2], [4, 1], [4, 2])

function blocksArb(postIds: string[], assetIds: string[]): fc.Arbitrary<Block[]> {
  const contents: fc.Arbitrary<BlockContent>[] = [
    textArb(500).map((text) => ({ kind: 'text' as const, text })),
    fc.constant({ kind: 'links' as const }),
    fc.constant({ kind: 'latest' as const }),
    fc.constant({ kind: 'ghost-home' as const }),
  ]
  if (postIds.length) contents.push(fc.constantFrom(...postIds).map((postId) => ({ kind: 'post' as const, postId })))
  if (assetIds.length) contents.push(fc.constantFrom(...assetIds).map((assetId) => ({ kind: 'image' as const, assetId })))
  const draft = fc.record({
    content: fc.oneof(...contents),
    size: sizeArb,
    x: fc.integer({ min: 0, max: 3 }),
    y: fc.integer({ min: 0, max: 6 }),
  })
  return fc.array(draft, { maxLength: 8 }).map((drafts) =>
    drafts.reduce<Block[]>(
      (layout, d, i) =>
        placeBlock(layout, { id: `blk${i}`, x: d.x, y: d.y, w: d.size[0], h: d.size[1], content: d.content }),
      [],
    ),
  )
}

function uniqueBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>()
  return xs.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)))
}

export const projectArb: fc.Arbitrary<Project> = fc
  .record({
    site: fc.record({
      slug: siteSlugArb,
      title: lineArb(80),
      tagline: lineArb(200),
      theme: fc.constantFrom(...THEMES),
    }),
    ghost: fc.record({ enabled: fc.boolean(), name: lineArb(24), color: fc.constantFrom(...GHOST_COLORS) }),
    assets: fc.uniqueArray(assetArb, { selector: (a) => a.id, maxLength: 4 }),
    posts: fc.uniqueArray(postBaseArb, { selector: (p) => p.id, maxLength: 6 }),
    links: fc.uniqueArray(linkArb, { selector: (l) => l.id, maxLength: 4 }),
    webring: fc.record({ prev: urlArb, next: urlArb, random: urlArb, hub: urlArb }, { requiredKeys: [] }),
  })
  .chain(({ assets, posts: rawPosts, ...rest }) => {
    const bases = uniqueBy(rawPosts, (p) => p.slug)
    const assetIds = assets.map((a) => a.id)
    const imagesArb = assetIds.length
      ? fc.subarray(assetIds, { maxLength: Math.min(3, assetIds.length) })
      : fc.constant<string[]>([])
    return fc
      .tuple(
        fc.array(imagesArb, { minLength: bases.length, maxLength: bases.length }),
        blocksArb(bases.map((p) => p.id), assetIds),
      )
      .map(([images, blocks]) => ({
        schemaVersion: 1 as const,
        ...rest,
        assets,
        blocks,
        posts: bases.map((p, i) => ({ ...p, imageIds: images[i]! })),
      }))
  })

export const PRIVATE_MARK = 'qqprivatemark'

/** Projects whose private posts carry unique marker strings that must never be exported. */
export const markedProjectArb: fc.Arbitrary<Project> = projectArb
  .filter((p) => !JSON.stringify({ ...p, assets: [] }).includes(PRIVATE_MARK))
  .map((p) => {
    let i = 0
    return {
      ...p,
      posts: p.posts.map((post) => {
        if (post.visibility !== 'private') return post
        const n = i++
        return {
          ...post,
          slug: `${PRIVATE_MARK}${n}`,
          title: `${PRIVATE_MARK}title${n}`,
          body: `${PRIVATE_MARK}body${n}`,
        }
      }),
    }
  })
