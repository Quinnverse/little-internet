import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildPayload, endpointAllowed, MODEL_OFF, rephrase, type ModelSettings } from '../src/editor/booModel.ts'

const card = { postId: 'p', title: 'SECRETTITLE', date: '2026-11-01', excerpt: 'SECRETEXCERPT about my day', kind: 'diary' as const, visibility: 'private' as const }
let url = ''
let server: ReturnType<typeof createServer>
const seen: { body: string; auth: string | undefined }[] = []
let mode: 'ok' | 'bad' | 'slow' | 'huge' = 'ok'

beforeAll(async () => {
  server = createServer((req, res) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      seen.push({ body: b, auth: req.headers.authorization })
      if (mode === 'slow') return void setTimeout(() => res.end('{}'), 3000)
      if (mode === 'bad') return void res.writeHead(500).end('nope')
      const content = mode === 'huge' ? 'x'.repeat(5000) : 'Warm version.'
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content } }] }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/chat`
})
afterAll(() => server.close())

const on = (extra: Partial<ModelSettings> = {}): ModelSettings => ({ ...MODEL_OFF, enabled: true, endpoint: url, model: 'm', ...extra })

describe('Boo model adapter privacy', () => {
  it('M1: off by default: nothing is sent', async () => {
    seen.length = 0
    expect(await rephrase(MODEL_OFF, 'q', 'local', [card], 'Boo', 'en')).toBe('local')
    expect(await rephrase({ ...on(), enabled: false }, 'q', 'local', [card], 'Boo', 'en')).toBe('local')
    expect(seen.length).toBe(0)
  })

  it('M2: by default only the question and the draft reply leave the device, never record text', async () => {
    seen.length = 0
    mode = 'ok'
    expect(await rephrase(on(), 'what did I write?', 'I found 1 record.', [card], 'Boo', 'en')).toBe('Warm version.')
    expect(seen.length).toBe(1)
    expect(seen[0]!.body).toContain('what did I write?')
    expect(seen[0]!.body).not.toContain('SECRETTITLE')
    expect(seen[0]!.body).not.toContain('SECRETEXCERPT')
  })

  it('M3: record text is sent only after the separate consent switch', () => {
    expect(JSON.stringify(buildPayload(on({ sendRecordText: true }), 'q', 'r', [card], 'Boo', 'en'))).toContain('SECRETEXCERPT')
    expect(JSON.stringify(buildPayload(on({ sendRecordText: false }), 'q', 'r', [card], 'Boo', 'en'))).not.toContain('SECRETEXCERPT')
  })

  it('M4: any failure, a slow server or an absurd answer falls back to the local reply', async () => {
    mode = 'bad'
    expect(await rephrase(on(), 'q', 'local', [], 'Boo', 'en')).toBe('local')
    mode = 'huge'
    expect(await rephrase(on(), 'q', 'local', [], 'Boo', 'en')).toBe('local')
    mode = 'slow'
    expect(await rephrase(on(), 'q', 'local', [], 'Boo', 'en', fetch, 300)).toBe('local')
    expect(await rephrase(on({ endpoint: 'http://127.0.0.1:1/x' }), 'q', 'local', [], 'Boo', 'en')).toBe('local')
    mode = 'ok'
  })

  it('M5: the key is sent only as a bearer header; only https (or localhost) endpoints are allowed', async () => {
    seen.length = 0
    await rephrase(on({ apiKey: 'sk-test' }), 'q', 'r', [], 'Boo', 'en')
    expect(seen[0]!.auth).toBe('Bearer sk-test')
    expect(seen[0]!.body).not.toContain('sk-test')
    for (const bad of ['http://example.com/v1', 'ftp://x/y', 'javascript:alert(1)', 'https://user:pw@example.com/', 'nonsense']) expect(endpointAllowed(bad)).toBe(false)
    for (const good of ['https://api.example.com/v1/chat/completions', 'http://localhost:11434/v1/chat', 'http://127.0.0.1:8080/x']) expect(endpointAllowed(good)).toBe(true)
    seen.length = 0
    expect(await rephrase(on({ endpoint: 'http://example.com/v1' }), 'q', 'local', [], 'Boo', 'en')).toBe('local')
    expect(seen.length).toBe(0)
  })

  it('M6: the prompt forbids new facts, advice and pretending to act', () => {
    const sys = buildPayload(on(), 'q', 'r', [], 'Boo', 'en').messages[0]!.content
    expect(sys).toMatch(/do not add facts/i)
    expect(sys).toMatch(/never claim/i)
  })
})
