import { placeBlock } from '../src/core/layout.ts'
import { buildPublishEnvelope, PUBLISH_LIMITS } from '../src/core/publish.ts'
import type { Project } from '../src/core/schema.ts'

const enc = new TextEncoder()

/** A deterministic Project with one public + one private post, one public + one private recording, and one photo. */
export function fixtureProject(slug = 'moon'): Project {
  const createdAt = '2026-10-01T12:00:00.000Z'
  const p: Project = {
    schemaVersion: 1,
    site: { slug, title: 'Moon’s corner', tagline: 'quiet', theme: 'paper' },
    ghost: { enabled: true, name: 'Boo', color: 'mint' },
    assets: [
      { id: 'pubphoto', mime: 'image/png', data: enc.encode('PUBLIC-PHOTO-BYTES') },
      { id: 'privphoto', mime: 'image/png', data: enc.encode('PRIVATE-PHOTO-BYTES') },
    ],
    posts: [
      { id: 'pubpost', slug: 'hello', title: 'Hello visitors', body: 'A public note.', createdAt, visibility: 'public', imageIds: ['pubphoto'] },
      { id: 'privpost', slug: 'secret', title: 'PRIVATE-TITLE-MARK', body: 'PRIVATE-BODY-MARK', createdAt, visibility: 'private', imageIds: ['privphoto'] },
    ],
    links: [],
    webring: {},
    recordings: [
      { id: 'pubrec', title: 'Public hello', createdAt, visibility: 'public', durationMs: 1000, mime: 'audio/webm', data: enc.encode('PUBLIC-AUDIO') },
      { id: 'privrec', title: 'PRIVATE-REC-MARK', createdAt, visibility: 'private', durationMs: 1000, mime: 'audio/webm', data: enc.encode('PRIVATE-AUDIO') },
    ],
    blocks: [],
  }
  p.blocks = placeBlock(p.blocks, { id: 'b1', x: 0, y: 0, w: 2, h: 1, content: { kind: 'post', postId: 'pubpost' } })
  p.blocks = placeBlock(p.blocks, { id: 'b2', x: 2, y: 0, w: 2, h: 1, content: { kind: 'image', assetId: 'pubphoto' } })
  return p
}

export function envelopeFor(username: string, project = fixtureProject()) {
  return buildPublishEnvelope(username, project)
}

export function makeToken() {
  // 32 random bytes => 43 base64url chars, matching the production format.
  const bytes = new Uint8Array(32)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = i
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export { PUBLISH_LIMITS }
