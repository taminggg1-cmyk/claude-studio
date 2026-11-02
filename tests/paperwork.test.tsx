import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const MSG = { role: 'user' as const, text: 'summary', toolUses: [] }
const LOCK = 'C:/Users/me/.claude/studio-office.json'
const OK_RUN = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }

function officeMocks(on: Parameters<TestBody>[1]) {
  const states: Record<string, any>[] = []
  mock.env(on, { USERPROFILE: 'C:/Users/me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.split(String.fromCharCode(92)).join('/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 't', pid: 7 }) } : { deny: 'ENOENT' }))
  on('process.run', () => OK_RUN)
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    if (path === '/state') states.push(JSON.parse(String(e.init?.body ?? '{}')).state)
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  return { last: () => states[states.length - 1] }
}

test('a compaction shows as running, then done with the token counts', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('session.compact', () => ({ messages: [MSG], tokensBefore: 150000, tokensAfter: 20000 }))

  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  expect(w.last()?.extras?.paperwork).toBeUndefined()

  await $.session.compact({ trigger: 'plugin', messages: [MSG] })
  await clock.advance(1500)
  const extras = w.last()?.extras?.paperwork
  expect(extras.state).toBe('done')
  expect(extras.trigger).toBe('plugin')
  expect(extras.before).toBe(150000)
  expect(extras.after).toBe(20000)
  expect(extras.done).toBeGreaterThanOrEqual(extras.at)
})

test('a failed compaction leaves the earlier value', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  let fail = false
  on('session.compact', () => {
    if (fail) throw new Error('no')
    return { messages: [MSG] }
  })

  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  expect(w.last()?.extras?.paperwork).toBeUndefined()

  await $.session.compact({ trigger: 'plugin', messages: [MSG] })
  await clock.advance(1500)
  const first = w.last()?.extras?.paperwork
  expect(first.state).toBe('done')
  expect(first.before).toBeUndefined()

  fail = true
  await $.session.compact({ trigger: 'plugin', messages: [MSG] }).catch(() => undefined)
  await clock.advance(1500)
  expect(w.last()?.extras?.paperwork).toEqual(first)
})
