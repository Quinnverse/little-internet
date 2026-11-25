import fc from 'fast-check'
import { FIELD_KEYS, POST_KINDS, TAG_PATTERN } from '../src/core/archive.ts'
import {
  BORDERS,
  DIVIDERS,
  FONTS,
  LOOKS,
  PATTERNS,
  STICKERS,
  STYLES,
  WIDGET_TYPES,
  defaultButton,
  type DecorationAsset,
  type SiteDesign,
  type SiteWidget,
  type ThemeTokens,
  type WidgetContent,
  type WidgetType,
} from '../src/core/design.ts'
import {
  autoSlot,
  DECOR_KINDS,
  FLOOR_SIZE,
  FLOORS,
  HOUSES,
  isReservedCell,
  LIGHTS,
  MEMORY_KINDS,
  WALLS,
  type Room,
} from '../src/core/room.ts'
import {
  GHOST_COLORS,
  IMAGE_MIMES,
  isCanonicalHttpUrl,
  isSafeLine,
  isSafeText,
  LANGS,
  AUDIO_MIMES,
  type Asset,
  type Recording,
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
    kind: fc.constantFrom(...POST_KINDS),
    tags: fc.uniqueArray(fc.stringMatching(/^[a-z0-9\u4e00-\u9fa5]{1,10}$/).filter((t) => TAG_PATTERN.test(t)), { maxLength: 4 }),
    fields: fc.dictionary(fc.constantFrom(...FIELD_KEYS), lineArb(60), { maxKeys: 3 }),
    starred: fc.boolean(),
  },
  { requiredKeys: ['id', 'slug', 'title', 'body', 'createdAt', 'visibility', 'kind', 'tags', 'fields', 'starred'] },
)

const recordingArb: fc.Arbitrary<Recording> = fc.record(
  {
    id: idArb,
    title: lineArb(80),
    createdAt: isoArb,
    visibility: fc.constantFrom('public' as const, 'private' as const),
    durationMs: fc.integer({ min: 1, max: 60_000 }),
    mime: fc.constantFrom(...AUDIO_MIMES),
    data: fc.uint8Array({ minLength: 1, maxLength: 24 }),
    openOn: fc.date({ min: new Date('2026-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
  },
  { requiredKeys: ['id', 'title', 'createdAt', 'visibility', 'durationMs', 'mime', 'data'] },
)

const linkArb: fc.Arbitrary<Link> = fc.record({ id: idArb, title: lineArb(80), url: urlArb })

const colorArb = fc.stringMatching(/^#[0-9a-f]{6}$/)

const tokensArb = (decoIds: string[]): fc.Arbitrary<ThemeTokens> =>
  fc
    .record({
      bg: colorArb,
      pattern: fc.constantFrom(...PATTERNS),
      patternColor: colorArb,
      bgAssetId: decoIds.length ? fc.option(fc.constantFrom(...decoIds), { nil: undefined }) : fc.constant(undefined),
      bgFit: fc.constantFrom('tile' as const, 'cover' as const),
      text: colorArb,
      muted: colorArb,
      accent: colorArb,
      link: colorArb,
      panel: colorArb,
      panelText: colorArb,
      headingFont: fc.constantFrom(...FONTS),
      bodyFont: fc.constantFrom(...FONTS),
      baseSize: fc.integer({ min: 13, max: 20 }),
      border: fc.constantFrom(...BORDERS),
      borderColor: colorArb,
      borderWidth: fc.integer({ min: 0, max: 8 }),
      radius: fc.integer({ min: 0, max: 24 }),
      shadow: fc.constantFrom('none' as const, 'soft' as const, 'hard' as const),
      look: fc.constantFrom(...LOOKS),
      divider: fc.constantFrom(...DIVIDERS),
      width: fc.constantFrom('narrow' as const, 'normal' as const, 'wide' as const),
      headerAlign: fc.constantFrom('left' as const, 'center' as const),
      titleSize: fc.integer({ min: 18, max: 64 }),
    })
    .map(({ bgAssetId, ...t }) => (bgAssetId ? { ...t, bgAssetId } : t))

function contentArb(type: WidgetType, postIds: string[], decoIds: string[]): fc.Arbitrary<WidgetContent> {
  const optDeco = decoIds.length ? fc.option(fc.constantFrom(...decoIds), { nil: undefined }) : fc.constant(undefined)
  const strip = <T extends Record<string, unknown>>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  switch (type) {
    case 'welcome':
      return fc.record({ type: fc.constant(type), heading: lineArb(80), text: textArb(600) })
    case 'about':
      return fc.record({ type: fc.constant(type), heading: lineArb(80), text: textArb(1200), assetId: optDeco }).map(strip)
    case 'diary':
      return fc.record({
        type: fc.constant(type),
        heading: lineArb(80),
        mode: fc.constantFrom('latest' as const, 'pick' as const),
        postIds: postIds.length ? fc.subarray(postIds) : fc.constant<string[]>([]),
        count: fc.integer({ min: 1, max: 12 }),
        excerpts: fc.boolean(),
      })
    case 'gallery':
      return fc.record({
        type: fc.constant(type),
        heading: lineArb(80),
        source: fc.constantFrom('posts' as const, 'uploads' as const),
        assetIds: decoIds.length ? fc.subarray(decoIds) : fc.constant<string[]>([]),
        count: fc.integer({ min: 1, max: 24 }),
      })
    case 'bookshelf':
      return fc.record({
        type: fc.constant(type),
        heading: lineArb(80),
        books: fc.uniqueArray(fc.record({ id: idArb, title: lineArb(120), author: lineArb(80), note: lineArb(200) }), { selector: (b) => b.id, maxLength: 3 }),
      })
    case 'memories':
    case 'boo':
    case 'webring':
    case 'button':
      return fc.record({ type: fc.constant(type), heading: lineArb(80) }) as fc.Arbitrary<WidgetContent>
    case 'audio':
      return fc.record({ type: fc.constant(type), heading: lineArb(80), text: lineArb(200) })
    case 'guestbook':
      return fc.record({ type: fc.constant(type), heading: lineArb(80), intro: lineArb(200), open: fc.boolean() })
    case 'links':
      return fc.record({ type: fc.constant(type), heading: lineArb(80), look: fc.constantFrom('list' as const, 'buttons' as const) })
    case 'text':
      return fc.record({ type: fc.constant(type), heading: lineArb(80), text: textArb(2000) })
    case 'image':
      return fc.record({ type: fc.constant(type), assetId: optDeco, caption: lineArb(200), href: fc.option(urlArb, { nil: undefined }) }).map(strip)
    case 'sticker':
      return fc
        .record({
          type: fc.constant(type),
          sticker: fc.constantFrom(...STICKERS),
          assetId: optDeco,
          size: fc.constantFrom('s' as const, 'm' as const, 'l' as const),
          motion: fc.constantFrom('none' as const, 'bob' as const, 'spin' as const, 'blink' as const),
        })
        .map(strip)
    case 'divider':
      return fc.record({ type: fc.constant(type), pattern: fc.constantFrom(...DIVIDERS) })
    case 'construction':
      return fc.record({ type: fc.constant(type), text: lineArb(80) })
  }
}

/** A valid design whose widgets point at the given posts and decorations. */
export function designArb(postIds: string[], decoIds: string[], title = 'Site'): fc.Arbitrary<SiteDesign> {
  const widget = (i: number, pageIds: string[]) =>
    fc.constantFrom(...WIDGET_TYPES).chain((type) =>
      fc.record({
        id: fc.constant(`w${i}`),
        pageId: fc.constantFrom(...pageIds),
        order: fc.integer({ min: 0, max: 50 }),
        hidden: fc.boolean(),
        layout: fc.record({
          span: fc.integer({ min: 1, max: 4 }),
          mobile: fc.constantFrom('full' as const, 'half' as const, 'hide' as const),
          desktop: fc.constantFrom('show' as const, 'hide' as const),
          align: fc.constantFrom('left' as const, 'center' as const, 'right' as const),
        }),
        style: fc
          .record({
            look: fc.constantFrom('auto' as const, ...LOOKS),
            bg: fc.option(colorArb, { nil: undefined }),
            fg: fc.option(colorArb, { nil: undefined }),
            tilt: fc.integer({ min: -3, max: 3 }),
          })
          .map(({ bg, fg, ...st }) => ({ ...st, ...(bg ? { bg } : {}), ...(fg ? { fg } : {}) })),
        content: contentArb(type, postIds, decoIds),
      }) as fc.Arbitrary<SiteWidget>,
    )
  return fc
    .record({
      style: fc.constantFrom(...STYLES),
      welcome: lineArb(200),
      pageCount: fc.integer({ min: 1, max: 3 }),
      count: fc.integer({ min: 0, max: 10 }),
      tokens: tokensArb(decoIds),
      favicon: decoIds.length ? fc.option(fc.constantFrom(...decoIds), { nil: undefined }) : fc.constant(undefined),
      buttonAsset: decoIds.length ? fc.option(fc.constantFrom(...decoIds), { nil: undefined }) : fc.constant(undefined),
      pageTitles: fc.array(lineArb(40), { minLength: 3, maxLength: 3 }),
      columns: fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 3, maxLength: 3 }),
    })
    .chain((r) => {
      const pages = Array.from({ length: r.pageCount }, (_, i) => ({
        id: `pg${i}`,
        slug: i === 0 ? 'index' : `page-${i}`,
        title: r.pageTitles[i]!,
        nav: true,
        columns: r.columns[i]!,
      }))
      const pageIds = pages.map((p) => p.id)
      return fc.tuple(...Array.from({ length: r.count }, (_, i) => widget(i, pageIds))).map((widgets) => {
        const assets: DecorationAsset[] = decoIds.map((id) => ({ id, kind: 'image', name: `deco ${id}` }))
        const d: SiteDesign = {
          v: 1,
          style: r.style,
          welcome: r.welcome,
          tokens: r.tokens,
          pages,
          widgets,
          assets,
          button: defaultButton(title),
          ...(r.favicon ? { faviconAssetId: r.favicon } : {}),
          ...(r.buttonAsset ? { buttonAssetId: r.buttonAsset } : {}),
        }
        return d
      })
    })
}

function uniqueBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>()
  return xs.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)))
}

/** A valid room whose memory objects point at some of the given posts. */
function roomArb(postIds: string[], recordingIds: string[]): fc.Arbitrary<Room> {
  const cells = fc
    .uniqueArray(fc.tuple(fc.nat(FLOOR_SIZE - 1), fc.nat(FLOOR_SIZE - 1)), {
      selector: ([x, z]) => `${x},${z}`,
      maxLength: 8,
    })
    .map((cs) => cs.filter(([x, z]) => !isReservedCell(x, z)))
  return fc
    .record({
      house: fc.constantFrom(...HOUSES),
      wall: fc.constantFrom(...WALLS),
      floor: fc.constantFrom(...FLOORS),
      light: fc.constantFrom(...LIGHTS),
      cells,
      kinds: fc.array(fc.constantFrom(...DECOR_KINDS), { minLength: 8, maxLength: 8 }),
      rots: fc.array(fc.nat(3), { minLength: 8, maxLength: 8 }),
      memoryKinds: fc.array(fc.constantFrom(...MEMORY_KINDS), { minLength: postIds.length, maxLength: postIds.length }),
      memoryOn: fc.array(fc.boolean(), { minLength: postIds.length, maxLength: postIds.length }),
      welcome: recordingIds.length ? fc.option(fc.constantFrom(...recordingIds), { nil: undefined }) : fc.constant(undefined),
    })
    .map((r) => {
      const room: Room = {
        house: r.house,
        wall: r.wall,
        floor: r.floor,
        light: r.light,
        decor: r.cells.map(([x, z], i) => ({ id: `d${i}`, kind: r.kinds[i]!, x, z, rot: r.rots[i]! })),
        memory: [],
      }
      postIds.forEach((postId, i) => {
        if (!r.memoryOn[i]) return
        const kind = r.memoryKinds[i]!
        const slot = autoSlot(room, kind)
        if (slot) room.memory.push({ id: `m${i}`, kind, postId, slot })
      })
      if (r.welcome !== undefined) room.welcomeRecordingId = r.welcome
      return room
    })
}

export const projectArb: fc.Arbitrary<Project> = fc
  .record({
    site: fc.record({
      slug: siteSlugArb,
      title: lineArb(80),
      tagline: lineArb(200),
      lang: fc.constantFrom(...LANGS),
    }),
    ghost: fc.record({ enabled: fc.boolean(), name: lineArb(24), color: fc.constantFrom(...GHOST_COLORS) }),
    assets: fc.uniqueArray(assetArb, { selector: (a) => a.id, maxLength: 4 }).map((xs) => xs.map((a) => ({ ...a, id: `p${a.id}`.slice(0, 40) }))),
    decorations: fc.uniqueArray(assetArb, { selector: (a) => a.id, maxLength: 3 }).map((xs) => xs.map((a) => ({ ...a, id: `d${a.id}`.slice(0, 40) }))),
    published: fc.boolean(),
    guestbook: fc.array(fc.record({ name: lineArb(40), text: lineArb(300), createdAt: isoArb }), { maxLength: 3 }),
    posts: fc.uniqueArray(postBaseArb, { selector: (p) => p.id, maxLength: 6 }),
    links: fc.uniqueArray(linkArb, { selector: (l) => l.id, maxLength: 4 }),
    recordings: fc.uniqueArray(recordingArb, { selector: (r) => r.id, maxLength: 4 }),
    webring: fc.record({ prev: urlArb, next: urlArb, random: urlArb, hub: urlArb }, { requiredKeys: [] }),
  })
  .chain(({ assets, decorations, published, guestbook, posts: rawPosts, ...rest }) => {
    const bases = uniqueBy(rawPosts, (p) => p.slug)
    const assetIds = assets.map((a) => a.id)
    const decoIds = decorations.map((a) => a.id)
    const imagesArb = assetIds.length
      ? fc.subarray(assetIds, { maxLength: Math.min(3, assetIds.length) })
      : fc.constant<string[]>([])
    return fc
      .tuple(
        fc.array(imagesArb, { minLength: bases.length, maxLength: bases.length }),
        designArb(bases.map((p) => p.id), decoIds, rest.site.title),
        designArb(bases.map((p) => p.id), decoIds, rest.site.title),
        roomArb(bases.map((p) => p.id), rest.recordings.map((r) => r.id)),
      )
      .map(([images, draft, pubDesign, room]) => ({
        schemaVersion: 2 as const,
        ...rest,
        assets: [...assets, ...decorations],
        web: {
          draft,
          ...(published ? { published: { design: pubDesign, at: '2026-11-20T10:00:00.000Z' } } : {}),
          guestbook,
        },
        room,
        posts: bases.map((p, i) => ({ ...p, imageIds: images[i]! })),
      }))
      .map((proj) => {
        // Gift records need their gift. Public gifts are only valid when the sender allowed sharing.
        const gifts = proj.posts
          .filter((x) => x.kind === 'gift')
          .map((x, i) => ({ id: `g${i}`, postId: x.id, from: 'a-friend', receivedAt: '2026-11-20T10:00:00.000Z', shareable: x.visibility === 'public' ? true : i % 2 === 0, letter: { v: 1 as const, paper: 'cream' as const, items: [{ t: 'seal' as const, id: 's1', x: 500, y: 500, rot: 0, scale: 1, color: '#aa2233' }] } }))
        return { ...proj, gifts }
      })
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
      recordings: p.recordings.map((r, n) => (r.visibility === 'private' ? { ...r, title: `${PRIVATE_MARK}rec${n}` } : r)),
    }
  })
