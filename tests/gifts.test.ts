import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from '../src/core/backup.ts'
import { exportSite } from '../src/core/exportZip.ts'
import { BLANK_LETTER, type Letter } from '../src/core/letter.ts'
import { publicProjection } from '../src/core/privacy.ts'
import { parseProject, type Project } from '../src/core/schema.ts'
import { DEFAULT_PEN, heartStroke } from '../src/core/strokes.ts'
import { createProject, deletePost, keepGift, setManyVisibility, setPostObject, setVisibility } from '../src/editor/commands.ts'

const dec = new TextDecoder()
const letter: Letter = { ...BLANK_LETTER, items: [{ t: 'drawing', id: 'd1', x: 500, y: 600, rot: 0, scale: 1, drawing: { v: 1, strokes: [heartStroke(500, 500, 250, DEFAULT_PEN)] } }, { t: 'text', id: 't1', x: 100, y: 200, rot: 0, scale: 1, text: 'SECRETLOVENOTE', font: 'hand', color: '#3a2a20', size: 40 }] }
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const base = (): Project => createProject({ title: 'Home', slug: 'home', style: 'blank', ghostName: 'Boo', ghostColor: 'white' })
const gift = (n: string, shareable: boolean, mailId?: string) => keepGift({ postId: `gp-${n}`, giftId: `g-${n}`, assetId: `ga-${n}`, png, ...(mailId ? { mailId } : {}), from: 'ana', fromTitle: 'Ana’s corner', receivedAt: '2026-11-22T10:00:00.000Z', shareable, letter, title: `Letter from Ana ${n}`, body: 'SECRETLOVENOTE' })

describe('Memory gifts', () => {
  it('G1: keeping a letter makes a private archive record with provenance, and keeping it twice changes nothing', () => {
    let p = gift('1', false, '11111111-1111-1111-1111-111111111111')(base())
    const post = p.posts.find((x) => x.id === 'gp-1')!
    expect(post).toMatchObject({ kind: 'gift', visibility: 'private', imageIds: ['ga-1'], fields: { sender: 'Ana’s corner' } })
    expect(p.gifts).toHaveLength(1)
    expect(p.gifts[0]).toMatchObject({ from: 'ana', shareable: false })
    expect(parseProject(p).ok).toBe(true)
    const again = gift('1b', false, '11111111-1111-1111-1111-111111111111')(p)
    expect(again).toBe(p)
  })

  it('G2: a gift the sender did not allow to share cannot be made public (single and batch)', () => {
    const p = gift('1', false)(base())
    expect(() => setVisibility('gp-1', 'public')(p)).toThrow(/did not allow/)
    expect(() => setManyVisibility(['gp-1'], 'public')(p)).toThrow(/did not allow/)
    expect(setVisibility('gp-1', 'private')(p).posts[0]!.visibility).toBe('private')
    const ok = gift('2', true)(base())
    expect(setVisibility('gp-2', 'public')(ok).posts[0]!.visibility).toBe('public')
  })

  it('G3: a tampered save cannot slip an unshareable gift into public view (schema refuses)', () => {
    const p = gift('1', false)(base())
    const bad = { ...p, posts: p.posts.map((x) => ({ ...x, visibility: 'public' as const })) }
    const r = parseProject(bad)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/did not allow|public/)
  })

  it('G4: private gifts never reach the website, RSS or the export; shareable public ones show their letter', () => {
    let p = base()
    p = gift('priv', false)(p)
    p = gift('open', true)(p)
    p = setVisibility('gp-open', 'public')(p)
    const files = unzipSync(exportSite(p))
    const text = Object.entries(files).filter(([n]) => !n.startsWith('assets/') && n !== 'room.js').map(([, b]) => dec.decode(b)).join('\n')
    expect(text).not.toContain('Ana 1priv')
    expect(text).not.toContain('gp-priv')
    expect(Object.keys(files).some((n) => n.includes('ga-priv'))).toBe(false)
    expect(Object.keys(files).some((n) => n.includes('ga-open'))).toBe(true)
    const page = Object.entries(files).find(([n]) => n.startsWith('posts/') && dec.decode(files[n]!).includes('gift-letter'))
    expect(page).toBeTruthy()
    expect(dec.decode(page![1])).toContain('<svg')
    // the projection a visitor could ever get has exactly the one allowed gift
    expect(publicProjection(p).gifts.map((g) => g.id)).toEqual(['g-open'])
  })

  it('G5: framing a gift on the wall changes nothing about the gift; removing the frame keeps it; deleting the record removes the gift too', () => {
    let p = gift('1', false)(base())
    p = setPostObject('gp-1', 'photo', 'obj-1')(p)
    expect(p.room.memory.some((m) => m.postId === 'gp-1')).toBe(true)
    const unframed = setPostObject('gp-1', null, 'x')(p)
    expect(unframed.room.memory.some((m) => m.postId === 'gp-1')).toBe(false)
    expect(unframed.gifts).toHaveLength(1)
    expect(unframed.posts.some((x) => x.id === 'gp-1')).toBe(true)
    const gone = deletePost('gp-1')(p)
    expect(gone.gifts).toHaveLength(0)
    expect(gone.room.memory).toHaveLength(0)
    expect(parseProject(gone).ok).toBe(true)
  })

  it('G6: the private backup keeps gifts, their letters, provenance and sharing permission exactly', () => {
    let p = base()
    p = gift('a', false, '22222222-2222-2222-2222-222222222222')(p)
    p = gift('b', true)(p)
    p = setPostObject('gp-a', 'photo', 'obj-a')(p)
    const r = restoreBackup(createBackup(p))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.gifts.map((g) => [g.id, g.postId, g.mailId, g.from, g.shareable])).toEqual(p.gifts.map((g) => [g.id, g.postId, g.mailId, g.from, g.shareable]))
    expect(r.value.gifts[0]!.letter).toEqual(letter)
    expect(r.value.room.memory.map((m) => m.postId)).toEqual(['gp-a'])
  })

  it('G7: a save from before gifts existed loads with no gifts', () => {
    const old = JSON.parse(JSON.stringify(base(), (_k, v) => (v instanceof Uint8Array ? [...v] : v)))
    delete old.gifts
    const r = parseProject(old)
    expect(r.ok && r.value.gifts).toEqual([])
  })

  it('G8: defence in depth: even a state that skipped the command guard (public gift, sender said no) is never published', () => {
    const p = gift('x', false)(base())
    const tampered: Project = { ...p, posts: p.posts.map((x) => ({ ...x, visibility: 'public' as const })) }
    const pub = publicProjection(tampered)
    expect(pub.posts).toHaveLength(0)
    expect(pub.gifts).toHaveLength(0)
    expect(pub.assets.some((a) => a.id === 'ga-x')).toBe(false)
    const files = unzipSync(exportSite(tampered))
    const all = Object.entries(files).filter(([n]) => !n.startsWith('assets/') && n !== 'room.js').map(([, b]) => dec.decode(b)).join('\n')
    expect(all).not.toContain('SECRETLOVENOTE')
    expect(Object.keys(files).some((n) => n.includes('ga-x'))).toBe(false)
  })
})
