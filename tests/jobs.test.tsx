import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const LOCK = 'C:/Users/me/.claude/studio-office.json'
const run = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const shell = (stdout: string, more: Record<string, unknown> = {}) => ({ result: { stdout, stderr: '', interrupted: false, ...more } })

function officeMocks(on: Parameters<TestBody>[1]) {
  const states: Record<string, any>[] = []
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('session.cwd', () => ({ value: 'C:\\work\\app' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.replace(/[\\]/g, '/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 't', pid: 7 }) } : { deny: 'ENOENT' }))
  on('process.run', () => run())
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    const body = JSON.parse(String(e.init?.body ?? '{}'))
    if (path === '/state') states.push(body.state)
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  return { jobs: () => states[states.length - 1]?.extras?.jobs }
}

/** The row the engine adds to the conversation when a background task ends. */
function notification(task: string, status: string, summary: string) {
  const text = `<task-notification>\n<task-id>${task}</task-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`
  return { message: { type: 'user', role: 'user', source: '', content: [{ type: 'text', text }] }, door: 'prompt', origin: { kind: 'task-notification' }, uuid: `row-${task}` } as any
}

test('a background command stays a job after its call returns, until its end is heard', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('classic.Stop', () => ({}))
  on('tool.call', (_, e) => {
    const command = String((e as { command?: unknown }).command ?? '')
    if (/dev/.test(command)) return shell('', { backgroundTaskId: 'bg-dev' })
    if (/build/.test(command)) return shell('', { backgroundTaskId: 'bg-build' })
    if (/serve/.test(command)) return shell('', { backgroundTaskId: 'bg-serve' })
    return shell('')
  })

  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true })
  await $.tool.call({ tool: 'PowerShell', command: 'npm run build', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'npx serve dist', run_in_background: true })
  await clock.advance(1500)

  let jobs = w.jobs()
  expect(jobs.jobs.map((j: { label: string }) => j.label)).toEqual(['npm run dev', 'npm run build', 'npx serve dist'])
  expect(jobs.jobs[0]).toMatchObject({ who: 'main', kind: 'background' })
  expect(jobs.done).toEqual([])

  // the dev server ends well, the build fails: their notifications say so
  await $.session.append(notification('bg-dev', 'completed', 'Background command "npm run dev" completed (exit code 0)'))
  await $.session.append(notification('bg-build', 'failed', 'Background command "npm run build" failed with exit code 1'))
  await clock.advance(1500)
  jobs = w.jobs()
  expect(jobs.jobs.map((j: { label: string }) => j.label)).toEqual(['npx serve dist'])
  expect(jobs.done.map((d: { ok: boolean | null }) => d.ok)).toEqual([true, false])

  // a stop lists the work still in flight: the server is not on it any more
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as any)
  await clock.advance(1500)
  jobs = w.jobs()
  expect(jobs.jobs).toEqual([])
  expect(jobs.done[jobs.done.length - 1]).toMatchObject({ ok: null })
})

test('a short foreground command is a job only while it runs', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  let during: any = null
  on('tool.call', () => {
    during = w.jobs()
    return shell('a.txt\n')
  })

  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(1500)

  // sent while it ran, with its start time (the window shows a machine only past 6 seconds)
  expect(during.jobs).toEqual([expect.objectContaining({ kind: 'shell', label: 'ls', who: 'main' })])
  expect(typeof during.jobs[0].since).toBe('number')
  // and gone once it returned, with nothing to light up
  expect(w.jobs()).toEqual({ jobs: [], done: [] })
})

test('a monitor watches until it is stopped', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('tool.call', (_, e) => {
    if (e.tool === 'Monitor') return { result: { taskId: 'mon-1', timeoutMs: 300000 } }
    if (e.tool === 'TaskStop') return { result: { message: 'stopped', task_id: 'mon-1', task_type: 'monitor' } }
    return shell('')
  })

  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await $.tool.call({ tool: 'Monitor', description: 'Watch the CI run', command: 'gh run watch', timeout_ms: 300000 } as any)
  await clock.advance(1500)
  expect(w.jobs().jobs).toEqual([expect.objectContaining({ kind: 'monitor', label: 'Watch the CI run' })])

  await $.tool.call({ tool: 'TaskStop', task_id: 'mon-1' } as any)
  await clock.advance(1500)
  expect(w.jobs().jobs).toEqual([])
  expect(w.jobs().done).toEqual([expect.objectContaining({ ok: null })])
})
