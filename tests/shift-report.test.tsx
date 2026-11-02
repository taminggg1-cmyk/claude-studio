import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const LOCK = 'C:/Users/me/.claude/studio-office.json'
const OK_RUN = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }

function officeMocks(on: Parameters<TestBody>[1]) {
  const states: Record<string, any>[] = []
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.replace(/[\\]/g, '/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 't', pid: 7 }) } : { deny: 'ENOENT' }))
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

test('the shift report counts files, edits, tests and errors of the session', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  let failing = false
  on('tool.call', () => (failing ? { isError: true as const, result: 'no', text: 'no' } : { result: {} }))

  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await $.tool.call({ tool: 'Edit', file_path: 'C:/work/app/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:/work/app/a.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Write', file_path: 'C:/work/app/b.ts', content: 'x' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  failing = true
  await $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await clock.advance(0)
  await clock.advance(0)

  const extras = w.last()?.extras?.['shift-report']
  expect(extras.files).toBe(2)
  expect(extras.edits).toBe(3)
  expect(extras.tests).toBe(1)
  expect(extras.errors).toBe(1)
  expect(extras.agents).toBe(0)
  expect(extras.fires).toBe(0)
  expect(extras.started).toBeGreaterThan(0)
})
