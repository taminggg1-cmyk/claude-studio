import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const OK_RUN = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }

test('the moments of a session reach the office as counts in a POST /stat body', async ($, on: Parameters<TestBody>[1]) => {
  const clock = mock.clock(on)
  const posts: { path: string; body: Record<string, any> }[] = []
  mock.env(on, { USERPROFILE: 'C:\Users\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', (_, e) => (e.path.includes('msedge') ? { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.includes('studio-office.json') ? { value: JSON.stringify({ port: 4321, token: 'secret-token', pid: 7 }) } : { deny: 'ENOENT' }))
  on('process.run', () => OK_RUN)
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    const body = JSON.parse(String((e.init as { body?: string } | undefined)?.body ?? '{}'))
    posts.push({ path, body })
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: 'C:/work/my-app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/b.ts', old_string: 'a', new_string: 'b' })
  await clock.advance(6000)

  const adds = posts.filter(p => p.path === '/stat').map(p => p.body.add as Record<string, number>)
  const total = (name: string) => adds.reduce((sum, add) => sum + (add[name] ?? 0), 0)
  expect(total('sessions')).toBe(1)
  expect(total('files-edited')).toBe(2)
  // every name and number is one the office accepts
  for (const add of adds) for (const [name, n] of Object.entries(add)) {
    expect(name).toMatch(/^[a-z][a-z0-9-]{0,39}$/)
    expect(Number.isInteger(n) && n >= 1 && n <= 100).toBe(true)
  }
})
