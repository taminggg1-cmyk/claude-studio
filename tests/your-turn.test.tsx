import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const LOCK = 'C:/Users/me/.claude/studio-office.json'

/** Mocks a running shared office and collects every studio state the mod posts to it. */
function officeMocks(on: Parameters<TestBody>[1]) {
  const posts: { path: string; body: Record<string, any> }[] = []
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.replace(/[\\]/g, '/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 't', pid: 7 }) } : { deny: 'ENOENT' }))
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    posts.push({ path, body: JSON.parse(String(e.init?.body ?? '{}')) })
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.log', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'ok' }))
  /** The your-turn extras of the newest studio state. */
  const extras = () => posts.filter(p => p.path === '/state').pop()?.body.state.extras?.['your-turn']
  return { extras }
}

const done = { answer: 'ok', durationMs: 5, isAborted: false, reason: 'answer', turnId: 't1' } as Parameters<
  Parameters<TestBody>[0]['turn']['complete']
>[0]

test('a finished turn waits for you, and the next turn clears it', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await clock.advance(0)
  expect(w.extras()?.waiting ?? null).toBe(null)

  await $.turn.complete(done)
  await clock.advance(1500)
  await clock.advance(0)
  await clock.advance(0)
  expect(w.extras()?.waiting).toBe('you')
  expect(w.extras()?.since).toBeGreaterThan(0)

  await $.turn.start({ text: 'go on', turnId: 't2' })
  await clock.advance(1500)
  await clock.advance(0)
  await clock.advance(0)
  expect(w.extras()?.waiting ?? null).toBe(null)
})

test('a subagent finishing does not make the session wait for you', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await clock.advance(0)
  await $.turn.complete({ ...done, agentId: 'a1' })
  await clock.advance(1500)
  await clock.advance(0)
  expect(w.extras()?.waiting ?? null).toBe(null)
})
