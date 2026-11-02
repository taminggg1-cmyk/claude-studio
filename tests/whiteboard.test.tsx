import { expect, mock, test } from 'claude-code/testing'

const LOCK = 'C:/Users/me/.claude/studio-office.json'

test('a created task and its update to completed reach the studio as whiteboard notes', async ($, on) => {
  const clock = mock.clock(on)
  const posts: Record<string, any>[] = []
  mock.env(on, { USERPROFILE: 'C:/Users/me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', (_, e) => (e.path.includes('msedge') ? { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.split(String.fromCharCode(92)).join('/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 'tok', pid: 7 }) } : { deny: 'ENOENT' }))
  on('process.run', (_, e) => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    if (path === '/state') posts.push(JSON.parse(String(e.init?.body ?? '{}')).state)
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('tool.call', (_, e) => (e.tool === 'TaskCreate' ? { result: { task: { id: '7', subject: 'x' } }, text: 'Task #7 created successfully' } : { result: { success: true } }))

  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  expect(posts.pop()?.extras?.whiteboard).toBeUndefined()

  await $.tool.call({ tool: 'TaskCreate', subject: 'Write the parser, with a very long title that goes past forty characters', description: 'd' })
  await clock.advance(1500)
  const first = posts.pop()?.extras?.whiteboard
  expect(first.tasks).toHaveLength(1)
  expect(first.tasks[0]).toMatchObject({ id: '7', status: 'pending' })
  expect(first.tasks[0].text.length).toBeLessThanOrEqual(40)

  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'completed' })
  await clock.advance(1500)
  const second = posts.pop()?.extras?.whiteboard
  expect(second.tasks[0].status).toBe('completed')
  expect(second.changed).toBeGreaterThanOrEqual(first.changed)

  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'deleted' })
  await clock.advance(1500)
  expect(posts.pop()?.extras?.whiteboard).toBeUndefined()
})
