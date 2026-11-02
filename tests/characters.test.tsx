import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const LOCK = 'C:/Users/me/.claude/studio-office.json'
const OK_RUN = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
const REPLY = '{"name":"Tsuki","color":"#6a8fd8","about":"Moon-gazer.","lines":{"hello":["Evening, team."],"idle":["Looking at the moon."]}}'

/** The shared office with `inbox` waiting for this session; collects what is posted to /reply. */
function office(on: Parameters<TestBody>[1], inbox: unknown[], modelText: string) {
  const replies: Record<string, any>[] = []
  const asked: { model: string; prompt: string; maxTokens?: number }[] = []
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', (_, e) => (e.path.includes('msedge') ? { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.read', (_, e) =>
    e.path.replace(/[\\]/g, '/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 'secret-token', pageKey: 'abcdef0123456789', pid: 7 }) } : { deny: 'ENOENT' },
  )
  on('process.run', () => OK_RUN)
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    if (path === '/window') return { value: { status: 200, ok: true, headers: {}, text: '{"open":true}' } }
    if (path === '/inbox') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ commands: inbox.splice(0) }) } }
    if (path === '/reply') replies.push(JSON.parse(String(e.init?.body ?? '{}')))
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('model.complete', (_, e) => {
    asked.push({ model: e.model, prompt: String(e.prompt), maxTokens: e.maxTokens })
    return { value: { isAnswered: true, text: modelText, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  return { replies, asked }
}

const COMMAND = { id: 'p1', kind: 'persona', text: '', at: Date.now(), data: { file: 'tsuki.vrm', name: 'Tsuki', author: 'Someone', meta: { licence: 'CC0', limits: [] } } }

test('a persona asked for by the office is written by a small model and posted back', async ($, on) => {
  const clock = mock.clock(on)
  const w = office(on, [COMMAND], `Here you go:\n${REPLY}`)
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(4000)
  expect(w.asked.length).toBe(1)
  expect(w.asked[0]?.model).toBe('haiku')
  expect(w.asked[0]?.prompt).toContain('Tsuki')
  expect(w.replies.length).toBe(1)
  expect(w.replies[0]?.kind).toBe('persona')
  expect(w.replies[0]?.id).toBe('p1')
  expect(w.replies[0]?.reply.file).toBe('tsuki.vrm')
  expect(w.replies[0]?.reply.persona.name).toBe('Tsuki')
  expect(w.replies[0]?.reply.persona.lines.hello).toEqual(['Evening, team.'])
})

test('a reply that is not JSON is reported as an error, not a persona', async ($, on) => {
  const clock = mock.clock(on)
  const w = office(on, [COMMAND], 'I cannot do that.')
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(4000)
  expect(w.replies.length).toBe(1)
  expect(w.replies[0]?.reply.file).toBe('tsuki.vrm')
  expect(w.replies[0]?.reply.persona).toBeUndefined()
  expect(typeof w.replies[0]?.reply.error).toBe('string')
})
